// Ajuste de forma de pagamento: para erros do tipo "cliente sem saldo de adiantamento" (a nota fiscal já
// foi emitida com a forma de pagamento "Adiantamento Cliente", e a integração bloqueia porque o cliente
// não tem saldo suficiente). Troca a forma de pagamento SÓ no JSON que alimenta o caixa/ERP (exchange no
// AS) e reprocessa — a nota fiscal já autorizada pela SEFAZ (o `xml` dentro do mesmo JSON) não é tocada.
import pg from 'pg';
import { obterCliente, listarBases } from './db';
import { descriptografar } from './crypto';
import { garantirVinculo, type ConexaoCfg } from './vinculo';
import { classificarErro, ehSaldoAdiantamento, sanitizarTexto } from './classificar';
import { limparCachePainel } from './painel-erros';
import type { AgenteCliente } from './types';
import { obterPadraoCliente, definirPadraoCliente, limparPadraoCliente, CHAVE_FORMA_PAGAMENTO_AJUSTE } from './padroes-cliente';

const TIPO_ADIANTAMENTO = 'AC';

export interface CandidatoFormaPagto {
  id: number;
  tipo: string;
  descricao: string;
}

/**
 * Forma de pagamento usada como padrão nesta base (cliente) pro ajuste de "sem saldo de adiantamento" —
 * pra não perguntar de novo toda vez. É por cliente: o catálogo (`tab_forma_pagto_pdv`) é do EMSys3 de
 * CADA cliente. Guardado na tabela genérica de padrões por cliente (`padroes-cliente.ts`).
 */
export async function obterFormaPagtoPadrao(empresa_id: string, cliente_id: string): Promise<CandidatoFormaPagto | null> {
  return obterPadraoCliente<CandidatoFormaPagto>(empresa_id, cliente_id, CHAVE_FORMA_PAGAMENTO_AJUSTE);
}

/** Grava (ou troca) a forma de pagamento padrão desta base. */
export async function definirFormaPagtoPadrao(empresa_id: string, cliente_id: string, forma: CandidatoFormaPagto): Promise<void> {
  await definirPadraoCliente(empresa_id, cliente_id, CHAVE_FORMA_PAGAMENTO_AJUSTE, forma);
}

/** Remove o padrão desta base — volta a perguntar a forma de pagamento na próxima vez. */
export async function limparFormaPagtoPadrao(empresa_id: string, cliente_id: string): Promise<void> {
  await limparPadraoCliente(empresa_id, cliente_id, CHAVE_FORMA_PAGAMENTO_AJUSTE);
}

export interface ItemAjustePagamento {
  codigo: string;
  empresa: string;
  /** Soma dos pagamentos em Adiantamento Cliente encontrados nesta venda */
  valorAdiantamento: number;
  formaAtual: CandidatoFormaPagto;
}

export interface PreviewAjustePagamento {
  ok: boolean;
  erro?: string;
  itens: ItemAjustePagamento[];
  /** Códigos pedidos que não tinham pagamento em Adiantamento Cliente (não são tocados) */
  semAdiantamento: string[];
}

export interface ResultadoAjustePagamento {
  ok: boolean;
  erro?: string;
  ajustados: number;
  ignorados: number;
  valorTotal: number;
}

export function novoClient(cfg: ConexaoCfg): pg.Client {
  return new pg.Client({
    host: cfg.db_host, port: cfg.db_porta, database: cfg.db_nome,
    user: cfg.db_usuario, password: cfg.db_senha,
    connectionTimeoutMillis: 8000, ssl: false, statement_timeout: 20000, query_timeout: 25000,
  });
}

// Remove acentos/caixa para comparar termos digitados ("cartão" ~ "cartao"). Sem depender da extensão
// unaccent do Postgres, que o servidor de produção não tem (ver memória do projeto).
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const PALAVRAS_IGNORADAS = new Set([
  'ajustar', 'ajusta', 'mudar', 'muda', 'trocar', 'troca', 'alterar', 'altera', 'quero', 'queria',
  'favor', 'por', 'pra', 'para', 'de', 'da', 'do', 'a', 'o', 'forma', 'pagamento', 'pagto', 'venda',
  'essa', 'esse', 'esta', 'este', 'como', 'em', 'pagar', 'pago', 'paga',
]);

/** Extrai da mensagem livre do operador as palavras que valem para buscar no catálogo. */
export function extrairTermoBusca(mensagem: string): string[] {
  return normalizar(mensagem)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !PALAVRAS_IGNORADAS.has(w));
}

/**
 * Busca formas de pagamento no catálogo do EMSys3 (tab_forma_pagto_pdv — catálogo único, não é por
 * empresa) cujo nome bate com os termos digitados. A tabela tem poucas centenas de linhas: lê tudo e
 * ordena no Node (evita depender de unaccent no Postgres do cliente).
 */
export async function buscarFormasPagto(emsys: ConexaoCfg, mensagem: string): Promise<CandidatoFormaPagto[]> {
  const termos = extrairTermoBusca(mensagem);
  if (!termos.length) return [];

  const c = novoClient(emsys);
  await c.connect();
  try {
    const sch = `"${(emsys.db_schema || 'public').replace(/"/g, '""')}"`;
    const r = await c.query(`SELECT cod_forma_pagto, des_forma_pagto, ind_tipo FROM ${sch}.tab_forma_pagto_pdv`);
    const catalogo = r.rows
      .map((x: any) => ({ id: Number(x.cod_forma_pagto), tipo: String(x.ind_tipo ?? ''), descricao: sanitizarTexto(String(x.des_forma_pagto ?? '')) }))
      .filter((f) => f.tipo !== TIPO_ADIANTAMENTO) // não sugere trocar adiantamento por... adiantamento
      .map((f) => ({ f, nome: normalizar(f.descricao) }));

    // nomes mais curtos e sem sufixo de integração (ex: "Dinheiro" antes de "ABASTECE AI - DINHEIRO") vêm primeiro
    const ordenar = (lista: typeof catalogo) => lista.sort((a, b) => a.f.descricao.length - b.f.descricao.length).slice(0, 8).map(({ f }) => f);

    // Bate todos os termos (ex.: "dinheiro" -> "Dinheiro"). Se não achar nada (ex.: "cartão de crédito", onde
    // o catálogo tem só marcas — "VISA CREDITO", "ELO CREDITO" — sem a palavra "cartão"), tenta qualquer termo.
    const exato = ordenar(catalogo.filter(({ nome }) => termos.every((t) => nome.includes(t))));
    if (exato.length) return exato;
    return ordenar(catalogo.filter(({ nome }) => termos.some((t) => nome.includes(t))));
  } finally {
    await c.end().catch(() => {});
  }
}

/** Lê o `conteudo` (JSON) dos códigos ainda pendentes, direto do AS — não passa pelo cache do painel. */
async function lerConteudos(as: ConexaoCfg, codigos: string[]): Promise<Array<{ codigo: string; empresa: string; retorno: string; conteudo: string }>> {
  const ids = [...new Set(codigos)].filter((c) => /^\d{1,18}$/.test(c)).slice(0, 1000);
  if (!ids.length) return [];
  const c = novoClient(as);
  await c.connect();
  try {
    await c.query("SET client_encoding = 'LATIN1'");
    const r = await c.query(
      `SELECT codigo::text AS codigo, empresa::text AS empresa, requisicao, retorno, conteudo
         FROM exchange_emsys_gestao_monitoramento_pend
        WHERE codigo = ANY($1::bigint[]) AND situacao = 3 AND (reprocessar IS NULL OR reprocessar = false)`,
      [ids],
    );
    return r.rows.map((x: any) => ({ codigo: String(x.codigo), empresa: String(x.empresa), retorno: sanitizarTexto(String(x.retorno ?? '')), conteudo: String(x.conteudo ?? '') }));
  } finally {
    await c.end().catch(() => {});
  }
}

/** Pagamentos em Adiantamento Cliente (tipo AC) dentro do JSON da venda — o único campo que este ajuste toca. */
function pagamentosAdiantamento(conteudoJson: string): { valor: number; forma: CandidatoFormaPagto } | null {
  let obj: any;
  try { obj = JSON.parse(conteudoJson); } catch { return null; }
  const pagamentos = Array.isArray(obj?.pagamentos) ? obj.pagamentos : [];
  let valor = 0;
  let forma: CandidatoFormaPagto | null = null;
  for (const p of pagamentos) {
    if (p?.formaPagto?.tipo !== TIPO_ADIANTAMENTO) continue;
    valor += Number(p.valor ?? 0);
    if (!forma) forma = { id: Number(p.formaPagto.id), tipo: String(p.formaPagto.tipo), descricao: String(p.formaPagto.descricao ?? '') };
  }
  return forma ? { valor, forma } : null;
}

export type Preparado =
  | { ok: true; cliente: AgenteCliente; cfgAS: ConexaoCfg; cfgEm: ConexaoCfg | null }
  | { ok: false; erro: string };

/** Cliente + credenciais das bases AS/EMSys3, já com vínculo confirmado — reaproveitado pelos ajustes do painel. */
export async function preparar(cliente_id: string, empresa_id: string): Promise<Preparado> {
  const cliente = await obterCliente(cliente_id, empresa_id).catch(() => null);
  if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' };

  const vinculo = await garantirVinculo(cliente.id, empresa_id);
  if (!vinculo.ok) return { ok: false, erro: `Vínculo AS x EMSys3 não validado: ${vinculo.erro}` };

  try {
    const cfgAS: ConexaoCfg = { ...cliente, db_senha: descriptografar(cliente.db_senha) };
    const baseEmsys = (await listarBases(cliente.id, empresa_id).catch(() => [])).find((b) => b.papel === 'emsys' && b.ativo);
    const cfgEm: ConexaoCfg | null = baseEmsys ? { ...baseEmsys, db_senha: descriptografar(baseEmsys.db_senha) } : null;
    return { ok: true, cliente, cfgAS, cfgEm };
  } catch {
    return { ok: false, erro: 'Não foi possível ler as credenciais do cliente.' };
  }
}

/** Formas de pagamento cujo nome bate com a mensagem do operador, na base EMSys3 do cliente. */
export async function buscarFormasPagtoDoCliente(cliente_id: string, empresa_id: string, mensagem: string): Promise<
  { ok: true; candidatos: CandidatoFormaPagto[] } | { ok: false; erro: string }
> {
  const p = await preparar(cliente_id, empresa_id);
  if (!p.ok) return { ok: false, erro: p.erro };
  if (!p.cfgEm) return { ok: false, erro: 'Cliente sem base EMSys3 vinculada — não há catálogo de formas de pagamento para buscar.' };
  try {
    return { ok: true, candidatos: await buscarFormasPagto(p.cfgEm, mensagem) };
  } catch (e: any) {
    return { ok: false, erro: `Não foi possível buscar no EMSys3: ${e?.message ?? 'falha desconhecida'}` };
  }
}

/**
 * Prévia: para cada código pedido, mostra o valor e a forma atual (Adiantamento Cliente) que seriam
 * trocados. Só é chamada depois que o operador já escolheu a forma de pagamento nova — não escreve nada.
 * Recusa erros de outra categoria (ex.: combustível) mesmo que a tela mande o código por engano.
 */
export async function previewAjustePagamento(cliente_id: string, empresa_id: string, codigos: string[]): Promise<PreviewAjustePagamento> {
  const p = await preparar(cliente_id, empresa_id);
  if (!p.ok) return { ok: false, erro: p.erro, itens: [], semAdiantamento: [] };

  const linhas = await lerConteudos(p.cfgAS, codigos);
  if (!linhas.length) return { ok: false, erro: 'Esses erros não estão mais pendentes no painel. Atualize a tela.', itens: [], semAdiantamento: [] };

  const foraDaCategoria = linhas.filter((l) => !ehSaldoAdiantamento(classificarErro(l.retorno, null, null).categoria));
  if (foraDaCategoria.length) {
    return { ok: false, erro: 'Um ou mais erros selecionados não são do tipo "cliente sem saldo de adiantamento". Atualize a tela e selecione de novo.', itens: [], semAdiantamento: [] };
  }

  const itens: ItemAjustePagamento[] = [];
  const semAdiantamento: string[] = [];
  for (const l of linhas) {
    const ac = pagamentosAdiantamento(l.conteudo);
    if (!ac) { semAdiantamento.push(l.codigo); continue; }
    itens.push({ codigo: l.codigo, empresa: l.empresa, valorAdiantamento: ac.valor, formaAtual: ac.forma });
  }
  return { ok: true, itens, semAdiantamento };
}

/**
 * Aplica: troca a forma de pagamento (tipo AC) pela escolhida em cada venda e marca reprocessar = true.
 * Só toca o(s) `pagamentos[].formaPagto` com tipo AC — o resto do JSON (inclusive o `xml` da nota fiscal
 * já autorizada) fica exatamente como estava. Transação por código: ou grava e marca reprocessar, ou nada.
 */
export async function aplicarAjustePagamento(
  cliente_id: string,
  empresa_id: string,
  codigos: string[],
  novaForma: CandidatoFormaPagto,
  usuario_id?: string,
): Promise<ResultadoAjustePagamento> {
  const p = await preparar(cliente_id, empresa_id);
  if (!p.ok) return { ok: false, erro: p.erro, ajustados: 0, ignorados: 0, valorTotal: 0 };

  const linhas = await lerConteudos(p.cfgAS, codigos);
  if (!linhas.length) return { ok: false, erro: 'Esses erros não estão mais pendentes no painel. Atualize a tela.', ajustados: 0, ignorados: 0, valorTotal: 0 };

  const foraDaCategoria = linhas.filter((l) => !ehSaldoAdiantamento(classificarErro(l.retorno, null, null).categoria));
  if (foraDaCategoria.length) {
    return { ok: false, erro: 'Um ou mais erros selecionados não são do tipo "cliente sem saldo de adiantamento".', ajustados: 0, ignorados: 0, valorTotal: 0 };
  }

  const c = novoClient(p.cfgAS);
  await c.connect();
  let ajustados = 0, ignorados = 0, valorTotal = 0;
  try {
    await c.query('BEGIN');
    for (const l of linhas) {
      let obj: any;
      try { obj = JSON.parse(l.conteudo); } catch { ignorados++; continue; }
      const pagamentos = Array.isArray(obj?.pagamentos) ? obj.pagamentos : [];
      let trocou = false;
      for (const pag of pagamentos) {
        if (pag?.formaPagto?.tipo !== TIPO_ADIANTAMENTO) continue;
        valorTotal += Number(pag.valor ?? 0);
        pag.formaPagto = { ...pag.formaPagto, id: novaForma.id, tipo: novaForma.tipo, descricao: novaForma.descricao };
        trocou = true;
      }
      if (!trocou) { ignorados++; continue; }

      const r = await c.query(
        `UPDATE exchange_emsys_gestao_monitoramento_pend
            SET conteudo = $2, reprocessar = true
          WHERE codigo = $1::bigint AND situacao = 3 AND (reprocessar IS NULL OR reprocessar = false)`,
        [l.codigo, JSON.stringify(obj)],
      );
      if (r.rowCount) ajustados++; else ignorados++;
    }
    await c.query('COMMIT');
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {});
    return { ok: false, erro: `Falha ao gravar: ${e?.message ?? 'erro desconhecido'}`, ajustados: 0, ignorados: 0, valorTotal: 0 };
  } finally {
    await c.end().catch(() => {});
  }

  limparCachePainel(p.cliente.id);
  console.log(`[ajuste-pagamento] ${ajustados} venda(s) de "${p.cliente.nome}" trocada(s) para "${novaForma.descricao}" (id ${novaForma.id}) e reprocessadas por ${usuario_id ?? 'usuário'}; ${ignorados} ignorada(s)`);
  return { ok: true, ajustados, ignorados, valorTotal };
}
