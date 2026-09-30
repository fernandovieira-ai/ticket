// Ajuste de estoque: para erros "Saldo Quantidade do item insuficiente no estoque" de PRODUTO DE LOJA
// (nunca combustível/tanque — essa categoria é bloqueada em regras-painel.ts e re-confirmada aqui).
// Reconfirma o saldo real (mesma fórmula assinada da trigger fc_tbi_tab_movimento_estoque — ver lição
// em agente_conhecimento) e, se o déficit for real, lança uma entrada de estoque (por inventário, por
// padrão) cobrindo exatamente o que falta, na véspera da data do erro — só assim a venda pendente
// consegue reprocessar, porque a trigger confere o saldo ATÉ a data da venda, não o saldo de hoje.
import pg from 'pg';
import type { ConexaoCfg } from './vinculo';
import { preparar, novoClient, normalizar, extrairTermoBusca } from './ajuste-pagamento';
import { classificarErro, parseSaldoInsuficiente, sanitizarTexto, CATEGORIA_SALDO_PRODUTO_LOJA, type InfoAlmoxarifado } from './classificar';
import { lerLinhasPorCodigo, almoxarifadosDe, reprocessarPainel, codEmpresaPorCnpj, quantidadeRealDaVenda } from './painel-erros';
import { saldoRealAteData } from './saldo-estoque';
import { obterPadraoCliente, definirPadraoCliente, limparPadraoCliente, CHAVE_TIPO_MOVIMENTO_ESTOQUE } from './padroes-cliente';

const TIPO_ENTRADA = 'E';

export interface CandidatoTipoMovimento {
  id: number;
  descricao: string;
}

/**
 * Tipo de movimento de entrada usado como padrão nesta base (cliente) — pra não perguntar de novo toda
 * vez. É por cliente, nunca por empresa: o catálogo (`tab_tipo_movimento_estoque`) é do EMSys3 de CADA
 * cliente, o `cod_tipo_movimento` de um cliente não tem relação com o de outro. Guardado na tabela
 * genérica de padrões por cliente (`padroes-cliente.ts`), junto com a forma de pagamento padrão etc.
 */
export async function obterTipoMovimentoPadrao(empresa_id: string, cliente_id: string): Promise<CandidatoTipoMovimento | null> {
  return obterPadraoCliente<CandidatoTipoMovimento>(empresa_id, cliente_id, CHAVE_TIPO_MOVIMENTO_ESTOQUE);
}

/** Grava (ou troca) o tipo de movimento padrão desta base. */
export async function definirTipoMovimentoPadrao(empresa_id: string, cliente_id: string, tipo: CandidatoTipoMovimento): Promise<void> {
  await definirPadraoCliente(empresa_id, cliente_id, CHAVE_TIPO_MOVIMENTO_ESTOQUE, tipo);
}

/** Remove o padrão desta base — volta a perguntar o tipo de movimento na próxima vez. */
export async function limparTipoMovimentoPadrao(empresa_id: string, cliente_id: string): Promise<void> {
  await limparPadraoCliente(empresa_id, cliente_id, CHAVE_TIPO_MOVIMENTO_ESTOQUE);
}

export interface ItemAjusteEstoque {
  /** códigos do painel cobertos por esta entrada (podem ser vários — mesmo item/almoxarifado/empresa) */
  codigos: string[];
  /** cod_empresa REAL do EMSys3 (resolvido pelo CNPJ da venda — nunca o código de empresa do lado do AS) */
  empresa: number;
  cod_item: number;
  des_item: string;
  cod_almoxarifado: number;
  des_almoxarifado: string;
  /** saldo real confirmado agora (mesma fórmula da trigger), até a véspera da data de referência */
  saldoReal: number;
  quantidadeNecessaria: number;
  deficit: number;
  /** data do erro mais antigo do grupo — a entrada é lançada 1 dia antes dela */
  dataReferencia: string;
  dataEntrada: string;
  custoUnitario: number | null;
  valorEntrada: number | null;
  /** Texto gravado em des_observacao (EMSys3, limite 255) — sempre "AJUSTE DO PAINEL" + de qual
   *  caixa/turno/mlid (fechamento da venda original) veio o déficit, pra rastrear a origem do lançamento. */
  observacao: string;
}

export interface PreviewAjusteEstoque {
  ok: boolean;
  erro?: string;
  itens: ItemAjusteEstoque[];
  /** grupos cujo saldo real já é suficiente agora — só precisam reprocessar, sem lançar entrada */
  semDeficit: string[];
  /** grupos com déficit real mas sem custo unitário confirmado — não aplicáveis sem informar um valor */
  semCusto: ItemAjusteEstoque[];
}

export interface ResultadoAjusteEstoque {
  ok: boolean;
  erro?: string;
  entradasLancadas: number;
  codigosReprocessados: number;
  valorTotal: number;
}

const LIMITE_OBSERVACAO = 255; // des_observacao (EMSys3)
const PREFIXO_OBSERVACAO = 'AJUSTE DO PAINEL - ';

/**
 * Monta o texto de des_observacao com a origem (caixa/turno/mlid/código) de cada venda que gerou o
 * déficit coberto por este movimento — pra dar rastreabilidade de onde veio o lançamento automático.
 * Corta em 255 chars (limite da coluna no EMSys3) e resume o que não coube em "+N mais".
 */
function construirObservacao(origens: { codigo: string; caixa: string; turno: number | null; mlid: string }[]): string {
  const partes = origens.map((o) => `caixa ${o.caixa}/turno ${o.turno ?? '?'}/mlid ${o.mlid} (cod ${o.codigo})`);
  let texto = PREFIXO_OBSERVACAO;
  let usados = 0;
  for (const p of partes) {
    const sep = usados > 0 ? '; ' : '';
    if ((texto + sep + p).length > LIMITE_OBSERVACAO - 12) break; // deixa espaço pro sufixo "+N mais"
    texto += sep + p;
    usados++;
  }
  if (usados < partes.length) texto += ` +${partes.length - usados} mais`;
  return texto.slice(0, LIMITE_OBSERVACAO);
}

function subtrairUmDia(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Formas de movimento de ENTRADA (tab_tipo_movimento_estoque, ind_tipo_movimento='E') que batem com a mensagem. */
export async function buscarTiposMovimentoEntrada(emsys: ConexaoCfg, mensagem: string): Promise<CandidatoTipoMovimento[]> {
  const termos = extrairTermoBusca(mensagem);
  if (!termos.length) return [];

  const c = novoClient(emsys);
  await c.connect();
  try {
    const sch = `"${(emsys.db_schema || 'public').replace(/"/g, '""')}"`;
    const r = await c.query(
      `SELECT cod_tipo_movimento, des_tipo_movimento FROM ${sch}.tab_tipo_movimento_estoque WHERE ind_tipo_movimento = $1`,
      [TIPO_ENTRADA],
    );
    const catalogo = r.rows
      .map((x: any) => ({ id: Number(x.cod_tipo_movimento), descricao: sanitizarTexto(String(x.des_tipo_movimento ?? '')) }))
      .map((f) => ({ f, nome: normalizar(f.descricao) }));

    const ordenar = (lista: typeof catalogo) => lista.sort((a, b) => a.f.descricao.length - b.f.descricao.length).slice(0, 8).map(({ f }) => f);

    const exato = ordenar(catalogo.filter(({ nome }) => termos.every((t) => nome.includes(t))));
    if (exato.length) return exato;
    return ordenar(catalogo.filter(({ nome }) => termos.some((t) => nome.includes(t))));
  } finally {
    await c.end().catch(() => {});
  }
}

async function custoUnitarioReal(c: pg.Client, cod_empresa: number, cod_item: number): Promise<number | null> {
  const r = await c.query(
    `SELECT val_custo_unitario FROM tab_item_empresa WHERE cod_item = $1 AND cod_empresa = $2`,
    [cod_item, cod_empresa],
  );
  const v = r.rows[0]?.val_custo_unitario;
  if (v != null && Number(v) > 0) return Number(v);

  // Sem custo cadastrado: usa o valor/quantidade do movimento mais recente do item com valor > 0
  const r2 = await c.query(
    `SELECT val_movimento_estoque, qtd_movimento_estoque FROM tab_movimento_estoque
      WHERE cod_item = $1 AND qtd_movimento_estoque > 0 AND val_movimento_estoque > 0
      ORDER BY dta_movimento DESC LIMIT 1`,
    [cod_item],
  );
  const row = r2.rows[0];
  if (row && Number(row.qtd_movimento_estoque) > 0) return Number(row.val_movimento_estoque) / Number(row.qtd_movimento_estoque);
  return null;
}

/** Monta a prévia (e é reaproveitada por aplicar, pra recalcular fresco em vez de confiar em dado antigo). */
async function montarPreview(p: Extract<Awaited<ReturnType<typeof preparar>>, { ok: true }>, codigos: string[]): Promise<PreviewAjusteEstoque> {
  if (!p.cfgEm) return { ok: false, erro: 'Cliente sem base EMSys3 vinculada — não há como confirmar o saldo real.', itens: [], semDeficit: [], semCusto: [] };

  const linhas = await lerLinhasPorCodigo(p.cfgAS, codigos);
  if (!linhas.length) return { ok: false, erro: 'Esses erros não estão mais pendentes no painel. Atualize a tela.', itens: [], semDeficit: [], semCusto: [] };

  const almox = await almoxarifadosDe(p.cfgEm, linhas.map((l) => l.retorno));
  const foraDaCategoria = linhas.filter((l) => classificarErro(l.retorno, l.requisicao, almox).categoria !== CATEGORIA_SALDO_PRODUTO_LOJA);
  if (foraDaCategoria.length) {
    return { ok: false, erro: 'Um ou mais erros selecionados não são do tipo "saldo insuficiente de produto de loja" (combustível nunca é ajustado por aqui). Atualize a tela e selecione de novo.', itens: [], semDeficit: [], semCusto: [] };
  }

  // `l.empresa` é um código do lado do AS, SEM relação com o cod_empresa do EMSys3 (confirmado: um caso
  // real tinha empresa="30351405" no AS e cod_empresa=105 no EMSys3 — CNPJs completamente diferentes).
  // A única forma confiável de saber o cod_empresa real é pelo CNPJ gravado no JSON da própria venda.
  const mapaEmpresa = await codEmpresaPorCnpj(p.cfgEm, linhas.map((l) => l.cnpj));
  const semCnpjResolvido = linhas.filter((l) => !l.cnpj || !mapaEmpresa.has(l.cnpj));
  if (semCnpjResolvido.length) {
    return {
      ok: false,
      erro: `Não foi possível confirmar a empresa EMSys3 (pelo CNPJ) do(s) código(s) ${semCnpjResolvido.slice(0, 5).map((l) => l.codigo).join(', ')}${semCnpjResolvido.length > 5 ? '…' : ''} — o JSON da venda não trouxe um CNPJ que exista em tab_empresa.`,
      itens: [], semDeficit: [], semCusto: [],
    };
  }

  type Origem = { codigo: string; caixa: string; turno: number | null; mlid: string };
  type Grupo = { codigos: string[]; origens: Origem[]; empresa: number; item: number; almoxarifado: number; quantidadeNecessaria: number; dataReferencia: string };
  const grupos = new Map<string, Grupo>();
  for (const l of linhas) {
    const info = parseSaldoInsuficiente(l.retorno);
    if (!info) return { ok: false, erro: `Não foi possível ler os dados (item/almoxarifado/data) do código ${l.codigo}.`, itens: [], semDeficit: [], semCusto: [] };
    const codEmpresa = mapaEmpresa.get(l.cnpj!)!;
    // A quantidade real vem do JSON da própria venda, não do texto do erro — "QUANTIDADE BAIXA" no retorno
    // é só o que a trigger reportou e pode não bater com a venda de verdade (mesma lição de conferir-combustivel.ts).
    const quantidade = quantidadeRealDaVenda(l.conteudo, info.item) ?? info.quantidadeBaixa;
    const origem: Origem = { codigo: l.codigo, caixa: l.caixa, turno: l.turno, mlid: l.mlid };
    const chave = `${codEmpresa}|${info.item}|${info.almoxarifado}`;
    const g = grupos.get(chave);
    if (g) {
      g.codigos.push(l.codigo);
      g.origens.push(origem);
      g.quantidadeNecessaria += quantidade;
      if (info.data < g.dataReferencia) g.dataReferencia = info.data;
    } else {
      grupos.set(chave, { codigos: [l.codigo], origens: [origem], empresa: codEmpresa, item: info.item, almoxarifado: info.almoxarifado, quantidadeNecessaria: quantidade, dataReferencia: info.data });
    }
  }

  const itensDesc = new Map<number, string>();
  const almoxDesc: Map<number, InfoAlmoxarifado> | null = almox;

  const c = novoClient(p.cfgEm);
  await c.connect();
  try {
    const sch = `"${(p.cfgEm.db_schema || 'public').replace(/"/g, '""')}"`;
    const itensIds = [...new Set([...grupos.values()].map((g) => g.item))];
    if (itensIds.length) {
      const r = await c.query(`SELECT cod_item, des_item FROM ${sch}.tab_item WHERE cod_item = ANY($1::int[])`, [itensIds]);
      for (const row of r.rows) itensDesc.set(Number(row.cod_item), sanitizarTexto(String(row.des_item ?? '')));
    }

    const itens: ItemAjusteEstoque[] = [];
    const semDeficit: string[] = [];
    const semCusto: ItemAjusteEstoque[] = [];

    for (const g of grupos.values()) {
      const dataEntrada = subtrairUmDia(g.dataReferencia);
      const saldoReal = await saldoRealAteData(c, g.empresa, g.item, g.almoxarifado, g.dataReferencia);
      const deficit = Math.round((g.quantidadeNecessaria - saldoReal) * 100000) / 100000;

      if (deficit <= 0) { semDeficit.push(...g.codigos); continue; }

      const custoUnitario = await custoUnitarioReal(c, g.empresa, g.item);
      const item: ItemAjusteEstoque = {
        codigos: g.codigos, empresa: g.empresa, cod_item: g.item, des_item: itensDesc.get(g.item) ?? `Item ${g.item}`,
        cod_almoxarifado: g.almoxarifado, des_almoxarifado: almoxDesc?.get(g.almoxarifado)?.des_almoxarifado ?? `Almoxarifado ${g.almoxarifado}`,
        saldoReal, quantidadeNecessaria: g.quantidadeNecessaria, deficit,
        dataReferencia: g.dataReferencia, dataEntrada,
        custoUnitario, valorEntrada: custoUnitario != null ? Math.round(deficit * custoUnitario * 100) / 100 : null,
        observacao: construirObservacao(g.origens),
      };
      if (custoUnitario == null) semCusto.push(item); else itens.push(item);
    }

    return { ok: true, itens, semDeficit, semCusto };
  } finally {
    await c.end().catch(() => {});
  }
}

export async function previewAjusteEstoque(cliente_id: string, empresa_id: string, codigos: string[]): Promise<PreviewAjusteEstoque> {
  const p = await preparar(cliente_id, empresa_id);
  if (!p.ok) return { ok: false, erro: p.erro, itens: [], semDeficit: [], semCusto: [] };
  return montarPreview(p, codigos);
}

export async function buscarTiposMovimentoDoCliente(cliente_id: string, empresa_id: string, mensagem: string): Promise<
  { ok: true; candidatos: CandidatoTipoMovimento[] } | { ok: false; erro: string }
> {
  const p = await preparar(cliente_id, empresa_id);
  if (!p.ok) return { ok: false, erro: p.erro };
  if (!p.cfgEm) return { ok: false, erro: 'Cliente sem base EMSys3 vinculada — não há catálogo de tipos de movimento para buscar.' };
  try {
    return { ok: true, candidatos: await buscarTiposMovimentoEntrada(p.cfgEm, mensagem) };
  } catch (e: any) {
    return { ok: false, erro: `Não foi possível buscar no EMSys3: ${e?.message ?? 'falha desconhecida'}` };
  }
}

/**
 * Aplica: lança uma entrada de estoque por item/almoxarifado (cobrindo o déficit real, recalculado na
 * hora) e reprocessa todos os códigos envolvidos — os que precisaram de entrada e os que já se
 * resolveram sozinhos (saldo real hoje já é suficiente). Códigos sem custo confirmado NÃO são tocados.
 */
export async function aplicarAjusteEstoque(
  cliente_id: string,
  empresa_id: string,
  codigos: string[],
  /** null só é aceito se a prévia não tiver nenhum item com déficit real (só `semDeficit`) — nesse caso
   *  nada é inserido e o tipo de movimento não faz falta. */
  tipoMovimento: CandidatoTipoMovimento | null,
  usuario_id?: string,
): Promise<ResultadoAjusteEstoque> {
  const p = await preparar(cliente_id, empresa_id);
  if (!p.ok) return { ok: false, erro: p.erro, entradasLancadas: 0, codigosReprocessados: 0, valorTotal: 0 };
  if (!p.cfgEm) return { ok: false, erro: 'Cliente sem base EMSys3 vinculada.', entradasLancadas: 0, codigosReprocessados: 0, valorTotal: 0 };

  const preview = await montarPreview(p, codigos);
  if (!preview.ok) return { ok: false, erro: preview.erro, entradasLancadas: 0, codigosReprocessados: 0, valorTotal: 0 };
  if (!preview.itens.length && !preview.semDeficit.length) {
    return { ok: false, erro: 'Nenhum item com déficit confirmado e custo conhecido para ajustar.', entradasLancadas: 0, codigosReprocessados: 0, valorTotal: 0 };
  }
  if (preview.itens.length && !tipoMovimento) {
    return { ok: false, erro: 'Tipo de movimento de entrada obrigatório: há item(ns) com déficit real a cobrir.', entradasLancadas: 0, codigosReprocessados: 0, valorTotal: 0 };
  }

  const c = novoClient(p.cfgEm);
  await c.connect();
  let valorTotal = 0;
  try {
    await c.query('BEGIN');
    for (const item of preview.itens) {
      valorTotal += item.valorEntrada ?? 0;
      await c.query(
        `INSERT INTO tab_movimento_estoque
           (seq_movimento, cod_empresa, cod_item, cod_almoxarifado, dta_movimento, cod_tipo_movimento,
            qtd_movimento_estoque, val_movimento_estoque, ind_manual, des_observacao)
         VALUES (nextval('gen_movimento_estoque'), $1, $2, $3, $4::date, $5, $6, $7, 'S', $8)`,
        [item.empresa, item.cod_item, item.cod_almoxarifado, item.dataEntrada, tipoMovimento!.id, item.deficit, item.valorEntrada ?? 0, item.observacao],
      );
    }
    await c.query('COMMIT');
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {});
    return { ok: false, erro: `Falha ao lançar entrada de estoque: ${e?.message ?? 'erro desconhecido'}`, entradasLancadas: 0, codigosReprocessados: 0, valorTotal: 0 };
  } finally {
    await c.end().catch(() => {});
  }

  // Estoque já corrigido no EMSys3 — agora libera os códigos no painel (AS) para reprocessar.
  // Se essa parte falhar, o operador pode reprocessar manualmente pelo botão "Só reprocessar no
  // painel": o estoque já está certo, então não há risco de duplicar a entrada numa nova tentativa
  // (a próxima prévia recalcula o déficit e ele já vem zerado).
  const codigosParaReprocessar = [...preview.itens.flatMap((i) => i.codigos), ...preview.semDeficit];
  const r = await reprocessarPainel(cliente_id, empresa_id, codigosParaReprocessar, usuario_id);
  if (!r.ok) {
    return {
      ok: true, entradasLancadas: preview.itens.length, codigosReprocessados: 0, valorTotal,
      erro: `Entrada de estoque lançada, mas falhou ao marcar reprocessar no painel: ${r.erro}. Use "Só reprocessar no painel" para esses códigos.`,
    };
  }

  console.log(`[ajuste-estoque] ${preview.itens.length} entrada(s) de estoque lançada(s) para "${p.cliente.nome}"${tipoMovimento ? ` (tipo ${tipoMovimento.descricao})` : ''}, ${r.marcados} código(s) reprocessado(s), por ${usuario_id ?? 'usuário'}`);
  return { ok: true, entradasLancadas: preview.itens.length, codigosReprocessados: r.marcados, valorTotal };
}
