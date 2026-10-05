// Ajuste de estoque: para erros "Saldo Quantidade do item insuficiente no estoque" de PRODUTO DE LOJA
// (nunca combustível/tanque — essa categoria é bloqueada em regras-painel.ts e re-confirmada aqui).
// Reconfirma o saldo real (mesma fórmula assinada da trigger fc_tbi_tab_movimento_estoque — ver lição
// em agente_conhecimento) e, se o déficit for real, lança uma entrada de estoque (por inventário, por
// padrão) cobrindo exatamente o que falta, na véspera da data do erro — só assim a venda pendente
// consegue reprocessar, porque a trigger confere o saldo ATÉ a data da venda, não o saldo de hoje.
import pg from 'pg';
import type { ConexaoCfg } from './vinculo';
import { preparar, novoClient, normalizar, extrairTermoBusca } from './ajuste-pagamento';
import { classificarErro, parseSaldoInsuficiente, sanitizarTexto, idTurnoDaVenda, CATEGORIA_SALDO_PRODUTO_LOJA, type InfoAlmoxarifado } from './classificar';
import { lerLinhasPorCodigo, almoxarifadosDe, reprocessarPainel, codEmpresaPorCnpj, quantidadeRealDaVenda } from './painel-erros';
import { saldoRealAteDataEmLote } from './saldo-estoque';
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
  /** Texto gravado em des_observacao (EMSys3, limite varia por base — ver `limitesColunasMovimento`) — sempre
   *  "AJUSTE DO PAINEL" + o(s) seq_fechamento (tab_fechamento_caixa_pdv) de onde veio o déficit, pra
   *  rastrear a origem do lançamento. */
  observacao: string;
}

export interface AjusteJaFeito {
  codigos: string[];
  /** ISO 8601, ou null quando o movimento é de antes da coluna dta_alteracao passar a ser gravada */
  quando: string | null;
  observacao: string;
}

export interface PreviewAjusteEstoque {
  ok: boolean;
  erro?: string;
  itens: ItemAjusteEstoque[];
  /** grupos cujo saldo real já é suficiente agora — só precisam reprocessar, sem lançar entrada */
  semDeficit: string[];
  /** subconjunto de `semDeficit` em que o saldo ficou suficiente por causa de um ajuste NOSSO anterior
   *  (des_observacao "AJUSTE DO PAINEL..." já gravado) — pra avisar "isso já foi ajustado" em vez de só
   *  "saldo já suficiente", que não deixa claro se foi o painel que corrigiu ou nunca precisou. */
  jaAjustado: AjusteJaFeito[];
  /** grupos com déficit real mas sem custo unitário confirmado — não aplicáveis sem informar um valor */
  semCusto: ItemAjusteEstoque[];
}

export interface ResultadoAjusteEstoque {
  ok: boolean;
  erro?: string;
  entradasLancadas: number;
  codigosReprocessados: number;
  valorTotal: number;
  /** Códigos que nem precisaram de entrada nova porque um ajuste NOSSO anterior já tinha coberto o
   *  déficit (ver `PreviewAjusteEstoque.jaAjustado`) — pra tela avisar explicitamente em vez de só
   *  reportar "0 entradas lançadas", que não deixa claro que não foi um erro. */
  jaAjustado?: AjusteJaFeito[];
}

// des_observacao/nom_usuario (EMSys3) não têm tamanho fixo entre clientes/versões — já visto varchar(100)
// e varchar(255) para des_observacao em bases diferentes. Fallback conservador: o menor valor já
// confirmado em produção (100 pra observação; 30 é o padrão do EMSys3 pra nom_usuario em geral).
const LIMITE_OBSERVACAO_PADRAO = 100;
const LIMITE_USUARIO_PADRAO = 30;
const PREFIXO_OBSERVACAO = 'AJUSTE DO PAINEL - ';
/** Gravado em nom_usuario (tab_movimento_estoque) pra identificar lançamentos automáticos do painel nas
 *  consultas/relatórios do EMSys3 — nunca fica NULL feito ficava antes (diferente de um usuário real). */
const USUARIO_PADRAO = 'AGENTE PAINEL';

/**
 * Lê o tamanho real de `des_observacao` e `nom_usuario` (tab_movimento_estoque) nesta base — nunca assume
 * um valor fixo — numa ÚNICA ida ao banco (as duas colunas de uma vez, não uma consulta por coluna).
 */
async function limitesColunasMovimento(c: pg.Client, schema: string): Promise<{ observacao: number; usuario: number }> {
  try {
    const r = await c.query(
      `SELECT column_name, character_maximum_length FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tab_movimento_estoque' AND column_name IN ('des_observacao', 'nom_usuario')`,
      [schema],
    );
    const porColuna = new Map(r.rows.map((row: any) => [row.column_name as string, row.character_maximum_length as number | null]));
    const obs = porColuna.get('des_observacao');
    const usu = porColuna.get('nom_usuario');
    return {
      observacao: obs === undefined ? LIMITE_OBSERVACAO_PADRAO : (obs == null ? Number.MAX_SAFE_INTEGER : Number(obs)),
      usuario: usu === undefined ? LIMITE_USUARIO_PADRAO : (usu == null ? Number.MAX_SAFE_INTEGER : Number(usu)),
    };
  } catch {
    return { observacao: LIMITE_OBSERVACAO_PADRAO, usuario: LIMITE_USUARIO_PADRAO };
  }
}

/**
 * Monta o texto de des_observacao com o(s) fechamento(s) de caixa (tab_fechamento_caixa_pdv.seq_fechamento
 * — ver `mapaFechamentoPorIdOrigem`) que geraram o déficit coberto por este movimento — a referência exata
 * e conferível no EMSys3. Deduplicado (vendas do mesmo fechamento aparecem uma vez só). Cai pro `mlid` do
 * AS só quando o fechamento não foi encontrado. Corta no limite real da coluna (`limitesColunasMovimento`) e
 * resume o que não coube em "+N mais".
 */
function construirObservacao(origens: { mlid: string; seqFechamento: number | null }[], limite: number): string {
  const refs = [...new Set(origens.map((o) => (o.seqFechamento != null ? `fechamento ${o.seqFechamento}` : `mlid ${o.mlid}`)))];
  let texto = PREFIXO_OBSERVACAO;
  let usados = 0;
  for (const r of refs) {
    const sep = usados > 0 ? ', ' : '';
    if ((texto + sep + r).length > limite - 12) break; // deixa espaço pro sufixo "+N mais"
    texto += sep + r;
    usados++;
  }
  if (usados < refs.length) texto += ` +${refs.length - usados} mais`;
  return texto.slice(0, limite);
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

/**
 * `seq_fechamento` (PK de tab_fechamento_caixa_pdv) do fechamento de caixa que gerou cada venda — achado
 * por `id_origem = idTurno` (ver `idTurnoDaVenda`, confirmado num caso real). É a referência exata e
 * conferível no EMSys3, melhor que o `mlid` do AS (que não corresponde a nada no EMSys3).
 */
async function mapaFechamentoPorIdOrigem(c: pg.Client, sch: string, idsOrigem: number[]): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  if (!idsOrigem.length) return mapa;
  const r = await c.query(
    `SELECT id_origem, seq_fechamento FROM ${sch}.tab_fechamento_caixa_pdv WHERE id_origem = ANY($1::bigint[])`,
    [idsOrigem],
  );
  for (const row of r.rows) mapa.set(Number(row.id_origem), Number(row.seq_fechamento));
  return mapa;
}

/**
 * Custo unitário de VÁRIOS pares (empresa, item) numa única ida ao banco (antes: até 2 consultas
 * sequenciais POR grupo — `tab_item_empresa` e, se sem custo cadastrado, o fallback no movimento mais
 * recente — repetidas mesmo quando dois grupos compartilhavam o mesmo item). Mesmo raciocínio de
 * `saldoRealAteDataEmLote`: 1 rodada de rede no total, não uma por grupo.
 */
async function custoUnitarioRealEmLote(c: pg.Client, pares: { empresa: number; item: number }[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!pares.length) return mapa;

  const empresas = pares.map((p) => p.empresa);
  const itens = pares.map((p) => p.item);
  const r = await c.query(
    `SELECT ie.cod_empresa, ie.cod_item, ie.val_custo_unitario
       FROM tab_item_empresa ie
       JOIN (SELECT UNNEST($1::int[]) AS cod_item, UNNEST($2::int[]) AS cod_empresa) v
         ON v.cod_item = ie.cod_item AND v.cod_empresa = ie.cod_empresa`,
    [itens, empresas],
  );
  for (const row of r.rows) {
    const v = Number(row.val_custo_unitario);
    if (v > 0) mapa.set(`${row.cod_empresa}|${row.cod_item}`, v);
  }

  // Sem custo cadastrado: usa o valor/quantidade do movimento mais recente do item com valor > 0 — em
  // lote, 1 consulta com DISTINCT ON pra todos os itens que ainda faltam, em vez de 1 por item/grupo.
  const itensFaltantes = [...new Set(pares.filter((p) => !mapa.has(`${p.empresa}|${p.item}`)).map((p) => p.item))];
  if (itensFaltantes.length) {
    const r2 = await c.query(
      `SELECT DISTINCT ON (cod_item) cod_item, val_movimento_estoque, qtd_movimento_estoque
         FROM tab_movimento_estoque
        WHERE cod_item = ANY($1::int[]) AND qtd_movimento_estoque > 0 AND val_movimento_estoque > 0
        ORDER BY cod_item, dta_movimento DESC`,
      [itensFaltantes],
    );
    const custoPorItem = new Map<number, number>();
    for (const row of r2.rows) {
      const qtd = Number(row.qtd_movimento_estoque);
      if (qtd > 0) custoPorItem.set(Number(row.cod_item), Number(row.val_movimento_estoque) / qtd);
    }
    for (const p of pares) {
      const chave = `${p.empresa}|${p.item}`;
      if (!mapa.has(chave) && custoPorItem.has(p.item)) mapa.set(chave, custoPorItem.get(p.item)!);
    }
  }

  return mapa;
}

/**
 * Pra grupos que caíram em `semDeficit` (saldo já suficiente agora): acha o ajuste automático NOSSO mais
 * recente (des_observacao começando com "AJUSTE DO PAINEL") pra essa combinação empresa/item/almoxarifado
 * — pra avisar explicitamente "isso já foi ajustado antes" em vez de um "saldo já suficiente" ambíguo que
 * não deixa claro se foi o painel que corrigiu ou se o déficit nunca existiu de verdade. Em lote: 1
 * consulta pra todas as combinações de uma vez.
 */
async function mapaUltimoAjuste(
  c: pg.Client,
  sch: string,
  combos: { empresa: number; item: number; almoxarifado: number }[],
): Promise<Map<string, { quando: string | null; observacao: string; seqMovimento: number }>> {
  const mapa = new Map<string, { quando: string | null; observacao: string; seqMovimento: number }>();
  if (!combos.length) return mapa;
  const r = await c.query(
    `SELECT DISTINCT ON (me.cod_empresa, me.cod_item, me.cod_almoxarifado)
            me.cod_empresa, me.cod_item, me.cod_almoxarifado, me.dta_alteracao, me.des_observacao, me.seq_movimento
       FROM ${sch}.tab_movimento_estoque me
       JOIN (SELECT UNNEST($1::int[]) AS cod_empresa, UNNEST($2::int[]) AS cod_item, UNNEST($3::int[]) AS cod_almoxarifado) v
         ON v.cod_empresa = me.cod_empresa AND v.cod_item = me.cod_item AND v.cod_almoxarifado = me.cod_almoxarifado
      WHERE me.des_observacao LIKE 'AJUSTE DO PAINEL%'
      ORDER BY me.cod_empresa, me.cod_item, me.cod_almoxarifado, me.seq_movimento DESC`,
    [combos.map((x) => x.empresa), combos.map((x) => x.item), combos.map((x) => x.almoxarifado)],
  );
  for (const row of r.rows) {
    mapa.set(`${row.cod_empresa}|${row.cod_item}|${row.cod_almoxarifado}`, {
      quando: row.dta_alteracao ? new Date(row.dta_alteracao).toISOString() : null,
      observacao: sanitizarTexto(String(row.des_observacao ?? '')),
      seqMovimento: Number(row.seq_movimento),
    });
  }
  return mapa;
}

/** Monta a prévia (e é reaproveitada por aplicar, pra recalcular fresco em vez de confiar em dado antigo). */
async function montarPreview(p: Extract<Awaited<ReturnType<typeof preparar>>, { ok: true }>, codigos: string[]): Promise<PreviewAjusteEstoque> {
  if (!p.cfgEm) return { ok: false, erro: 'Cliente sem base EMSys3 vinculada — não há como confirmar o saldo real.', itens: [], semDeficit: [], jaAjustado: [], semCusto: [] };

  const linhas = await lerLinhasPorCodigo(p.cfgAS, codigos);
  if (!linhas.length) return { ok: false, erro: 'Esses erros não estão mais pendentes no painel. Atualize a tela.', itens: [], semDeficit: [], jaAjustado: [], semCusto: [] };

  const almox = await almoxarifadosDe(p.cfgEm, linhas.map((l) => l.retorno));
  const foraDaCategoria = linhas.filter((l) => classificarErro(l.retorno, l.requisicao, almox).categoria !== CATEGORIA_SALDO_PRODUTO_LOJA);
  if (foraDaCategoria.length) {
    return { ok: false, erro: 'Um ou mais erros selecionados não são do tipo "saldo insuficiente de produto de loja" (combustível nunca é ajustado por aqui). Atualize a tela e selecione de novo.', itens: [], semDeficit: [], jaAjustado: [], semCusto: [] };
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
      itens: [], semDeficit: [], jaAjustado: [], semCusto: [],
    };
  }

  type Origem = { mlid: string; idTurno: number | null };
  type Grupo = { codigos: string[]; origens: Origem[]; empresa: number; item: number; almoxarifado: number; quantidadeNecessaria: number; dataReferencia: string };
  const grupos = new Map<string, Grupo>();
  for (const l of linhas) {
    const info = parseSaldoInsuficiente(l.retorno);
    if (!info) return { ok: false, erro: `Não foi possível ler os dados (item/almoxarifado/data) do código ${l.codigo}.`, itens: [], semDeficit: [], jaAjustado: [], semCusto: [] };
    const codEmpresa = mapaEmpresa.get(l.cnpj!)!;
    // A quantidade real vem do JSON da própria venda, não do texto do erro — "QUANTIDADE BAIXA" no retorno
    // é só o que a trigger reportou e pode não bater com a venda de verdade (mesma lição de conferir-combustivel.ts).
    const quantidade = quantidadeRealDaVenda(l.conteudo, info.item) ?? info.quantidadeBaixa;
    const origem: Origem = { mlid: l.mlid, idTurno: idTurnoDaVenda(l.conteudo) };
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
    const schemaNome = p.cfgEm.db_schema || 'public';
    const sch = `"${schemaNome.replace(/"/g, '""')}"`;
    const itensIds = [...new Set([...grupos.values()].map((g) => g.item))];
    if (itensIds.length) {
      const r = await c.query(`SELECT cod_item, des_item FROM ${sch}.tab_item WHERE cod_item = ANY($1::int[])`, [itensIds]);
      for (const row of r.rows) itensDesc.set(Number(row.cod_item), sanitizarTexto(String(row.des_item ?? '')));
    }
    const limites = await limitesColunasMovimento(c, schemaNome);
    const idTurnosDosGrupos = [...new Set([...grupos.values()].flatMap((g) => g.origens.map((o) => o.idTurno).filter((n): n is number => n != null)))];
    const fechamentoPorIdTurno = await mapaFechamentoPorIdOrigem(c, sch, idTurnosDosGrupos);

    // Saldo real de TODOS os grupos numa única ida ao banco (antes: 1 ida POR grupo, sequencial — ver
    // `saldoRealAteDataEmLote`). Só depois de saber quais têm déficit de verdade é que vale a pena gastar
    // outra ida pro custo unitário (não adianta custo de grupo que nem vai virar INSERT).
    const todosOsGrupos = [...grupos.values()];
    const saldoPorCombo = await saldoRealAteDataEmLote(
      c,
      todosOsGrupos.map((g) => ({ empresa: g.empresa, item: g.item, almoxarifado: g.almoxarifado, data: g.dataReferencia })),
    );

    const comDeficit: Array<{ g: Grupo; dataEntrada: string; saldoReal: number; deficit: number }> = [];
    const gruposSemDeficit: Grupo[] = [];
    const semDeficit: string[] = [];
    for (const g of todosOsGrupos) {
      const saldoReal = saldoPorCombo.get(`${g.empresa}|${g.item}|${g.almoxarifado}|${g.dataReferencia}`) ?? 0;
      const deficit = Math.round((g.quantidadeNecessaria - saldoReal) * 100000) / 100000;
      if (deficit <= 0) { semDeficit.push(...g.codigos); gruposSemDeficit.push(g); continue; }
      comDeficit.push({ g, dataEntrada: subtrairUmDia(g.dataReferencia), saldoReal, deficit });
    }

    // Pra quem ficou sem déficit: descobre se foi um ajuste NOSSO anterior que resolveu (avisa "já foi
    // ajustado" em vez de um "saldo já suficiente" ambíguo) — também em lote, 1 ida só.
    const ultimoAjustePorCombo = await mapaUltimoAjuste(
      c, sch,
      gruposSemDeficit.map((g) => ({ empresa: g.empresa, item: g.item, almoxarifado: g.almoxarifado })),
    );
    const jaAjustado: AjusteJaFeito[] = [];
    for (const g of gruposSemDeficit) {
      const achado = ultimoAjustePorCombo.get(`${g.empresa}|${g.item}|${g.almoxarifado}`);
      if (achado) jaAjustado.push({ codigos: g.codigos, quando: achado.quando, observacao: achado.observacao });
    }

    const custoPorPar = await custoUnitarioRealEmLote(c, comDeficit.map(({ g }) => ({ empresa: g.empresa, item: g.item })));

    const itens: ItemAjusteEstoque[] = [];
    const semCusto: ItemAjusteEstoque[] = [];
    for (const { g, dataEntrada, saldoReal, deficit } of comDeficit) {
      const custoUnitario = custoPorPar.get(`${g.empresa}|${g.item}`) ?? null;
      const origensResolvidas = g.origens.map((o) => ({
        ...o,
        seqFechamento: o.idTurno != null ? fechamentoPorIdTurno.get(o.idTurno) ?? null : null,
      }));
      const item: ItemAjusteEstoque = {
        codigos: g.codigos, empresa: g.empresa, cod_item: g.item, des_item: itensDesc.get(g.item) ?? `Item ${g.item}`,
        cod_almoxarifado: g.almoxarifado, des_almoxarifado: almoxDesc?.get(g.almoxarifado)?.des_almoxarifado ?? `Almoxarifado ${g.almoxarifado}`,
        saldoReal, quantidadeNecessaria: g.quantidadeNecessaria, deficit,
        dataReferencia: g.dataReferencia, dataEntrada,
        custoUnitario, valorEntrada: custoUnitario != null ? Math.round(deficit * custoUnitario * 100) / 100 : null,
        observacao: construirObservacao(origensResolvidas, limites.observacao),
      };
      if (custoUnitario == null) semCusto.push(item); else itens.push(item);
    }

    return { ok: true, itens, semDeficit, jaAjustado, semCusto };
  } finally {
    await c.end().catch(() => {});
  }
}

export async function previewAjusteEstoque(cliente_id: string, empresa_id: string, codigos: string[]): Promise<PreviewAjusteEstoque> {
  const p = await preparar(cliente_id, empresa_id);
  if (!p.ok) return { ok: false, erro: p.erro, itens: [], semDeficit: [], jaAjustado: [], semCusto: [] };
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
  /** Nome do operador (sessão), gravado em nom_usuario — identifica o lançamento automático nas consultas
   *  do EMSys3 em vez de ficar NULL. Cai pro `USUARIO_PADRAO` quando não vier (ex.: cron/varredura). */
  usuario_nome?: string,
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
    const limites = await limitesColunasMovimento(c, p.cfgEm.db_schema || 'public');
    const nomUsuario = (usuario_nome?.trim() || USUARIO_PADRAO).slice(0, limites.usuario);
    await c.query('BEGIN');
    for (const item of preview.itens) {
      valorTotal += item.valorEntrada ?? 0;
      await c.query(
        `INSERT INTO tab_movimento_estoque
           (seq_movimento, cod_empresa, cod_item, cod_almoxarifado, dta_movimento, cod_tipo_movimento,
            qtd_movimento_estoque, val_movimento_estoque, ind_manual, des_observacao, nom_usuario, dta_alteracao)
         VALUES (nextval('gen_movimento_estoque'), $1, $2, $3, $4::date, $5, $6, $7, 'S', $8, $9, NOW())`,
        [item.empresa, item.cod_item, item.cod_almoxarifado, item.dataEntrada, tipoMovimento!.id, item.deficit, item.valorEntrada ?? 0, item.observacao, nomUsuario],
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
      ok: true, entradasLancadas: preview.itens.length, codigosReprocessados: 0, valorTotal, jaAjustado: preview.jaAjustado,
      erro: `Entrada de estoque lançada, mas falhou ao marcar reprocessar no painel: ${r.erro}. Use "Só reprocessar no painel" para esses códigos.`,
    };
  }

  console.log(`[ajuste-estoque] ${preview.itens.length} entrada(s) de estoque lançada(s) para "${p.cliente.nome}"${tipoMovimento ? ` (tipo ${tipoMovimento.descricao})` : ''}, ${r.marcados} código(s) reprocessado(s), ${preview.jaAjustado.length} já ajustado(s) antes, por ${usuario_id ?? 'usuário'}`);
  return { ok: true, entradasLancadas: preview.itens.length, codigosReprocessados: r.marcados, valorTotal, jaAjustado: preview.jaAjustado };
}
