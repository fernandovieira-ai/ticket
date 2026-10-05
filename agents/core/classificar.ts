// Classifica um erro do painel EMSys Gestão em tipo + causa, para agrupar na tela "Painel de Erros".
// Regras por família, na ordem: a primeira que casar vale. Erro sem regra cai em "Outros" agrupado pela
// assinatura do texto (números/datas trocados por marcadores), então erros novos já se agrupam sozinhos.
import { normalizarErro } from './assinatura';

export type RiscoErro = 'alto' | 'medio';

export interface InfoAlmoxarifado {
  cod_almoxarifado: number;
  des_almoxarifado: string | null;
  /** 'S' = almoxarifado é um tanque (tem cod_item_tanque) */
  ind_tanque: string | null;
  num_tanque: number | null;
  /** Descrição do item do tanque (ex: DIESEL B S10) */
  des_item: string | null;
}

export interface Classificacao {
  categoria: string;
  causa: string;
  detalhe: string;
  risco: RiscoErro;
  /** Almoxarifado citado no erro (para consultar o EMSys3 e separar combustível de loja) */
  almox?: number;
}

const MAX_LISTA = 90;

/**
 * Erros de combustível NUNCA são ajustados pelo Painel de Erros (estoque/LMC): só é permitido
 * reprocessar a linha no painel (reprocessar = true). Regra imposta no servidor, não só na tela.
 */
export const ehCombustivel = (categoria: string) => categoria.endsWith('Combustível');

/** Categoria do erro "saldo insuficiente" para produto de loja (não combustível) — elegível ao ajuste de estoque. */
export const CATEGORIA_SALDO_PRODUTO_LOJA = 'Saldo insuficiente · Produto de loja';
export const ehSaldoProdutoLoja = (categoria: string) => categoria === CATEGORIA_SALDO_PRODUTO_LOJA;

/** Categoria do erro "cliente sem saldo de adiantamento" — elegível ao ajuste de forma de pagamento. */
export const CATEGORIA_SALDO_ADIANTAMENTO = 'Cliente sem saldo de adiantamento';
export const ehSaldoAdiantamento = (categoria: string) => categoria === CATEGORIA_SALDO_ADIANTAMENTO;

const cap = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/(^|[\s-])\S/g, (m) => m.toUpperCase()).trim();

/** Troca caracteres fora de LATIN1 (o painel vem em LATIN1 e o pg decodifica como UTF-8) por '?'. */
export function sanitizarTexto(s: string): string {
  return s.replace(/[^\x00-\xFF]/g, '?');
}

const num = (n: string) => Number(n);
const br = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const RE_SALDO = /ITEM = (\d+), Almoxarifado = (\d+), DATA = ([\d-]+), SALDO = (-?[\d.]+), QUANTIDADE BAIXA = ([\d.]+)/i;

/** Só extrai o almoxarifado citado (usado antes da consulta ao EMSys3). */
export function almoxarifadoDoErro(retorno: string): number | null {
  const m = retorno.match(/Almoxarifado = (\d+)/i);
  return m ? num(m[1]) : null;
}

export interface SaldoInsuficienteInfo {
  item: number;
  almoxarifado: number;
  /** Data do movimento que a trigger checou, no formato do texto original (ex: "2026-09-28") */
  data: string;
  /** Saldo que a mensagem original reportava (pode estar desatualizado — a ação de ajuste reconfirma) */
  saldoMensagem: number;
  quantidadeBaixa: number;
}

/** Extrai item/almoxarifado/data/saldo/quantidade da mensagem "Saldo Quantidade do item insuficiente...". */
export function parseSaldoInsuficiente(retorno: string): SaldoInsuficienteInfo | null {
  const m = sanitizarTexto(retorno ?? '').match(RE_SALDO);
  if (!m) return null;
  return { item: num(m[1]), almoxarifado: num(m[2]), data: m[3], saldoMensagem: num(m[4]), quantidadeBaixa: num(m[5]) };
}

/**
 * Resumo numérico de um grupo de mensagens (valores que a IA não deve "adivinhar" olhando 1 exemplo).
 * Hoje só entende saldo de estoque; devolve '' para os demais tipos.
 */
export function estatisticasGrupo(retornos: string[]): string {
  const saldos: number[] = [], baixas: number[] = [], deficits: number[] = [];
  const itens = new Set<string>(), almox = new Set<string>(), dias = new Set<string>();
  for (const r of retornos) {
    const info = parseSaldoInsuficiente(r);
    if (!info) continue;
    itens.add(String(info.item)); almox.add(String(info.almoxarifado));
    saldos.push(info.saldoMensagem); baixas.push(info.quantidadeBaixa); deficits.push(info.quantidadeBaixa - info.saldoMensagem);
    dias.add(info.data);
  }
  if (!saldos.length) return '';
  const faixa = (a: number[]) => `${br(Math.min(...a))} a ${br(Math.max(...a))}`;
  return [
    `Estatísticas de ${saldos.length} ocorrências de saldo insuficiente:`,
    `- item(ns): ${[...itens].join(', ')} | almoxarifado(s): ${[...almox].join(', ')} | data(s) do saldo: ${[...dias].sort().join(', ')}`,
    `- saldo disponível: ${faixa(saldos)} | quantidade a baixar: ${faixa(baixas)} | déficit (baixa − saldo): ${faixa(deficits)}`,
  ].join('\n');
}

/**
 * Quantidade REAL do item vendido, lida do próprio JSON da venda (`conteudo.itens[]`) — nunca do texto do
 * erro. O texto "QUANTIDADE BAIXA = ..." é só o que a trigger do EMSys3 reportou no momento da tentativa;
 * a fonte confiável da venda é o JSON que o EMSys Gestão exportou. Para combustível, usa a quantidade do
 * ABASTECIMENTO (medição física do bico/encerrante) em vez de `itens[].quantidade`, que é o mesmo valor na
 * maioria dos casos mas pode divergir se o item foi ajustado depois do abastecimento.
 * Retorna null se o JSON não puder ser lido ou não tiver um item com esse `cod_item` — quem chama deve usar
 * o valor do texto do erro como último recurso nesse caso, nunca travar a conferência por isso.
 */
export function quantidadeRealDaVenda(conteudoJson: string, cod_item: number): number | null {
  let obj: any;
  try { obj = JSON.parse(conteudoJson); } catch { return null; }
  const itens = Array.isArray(obj?.itens) ? obj.itens : [];
  if (!itens.length) return null;
  const item = itens.length === 1 ? itens[0] : itens.find((it: any) => Number(it?.id) === cod_item || Number(it?.codBarra) === cod_item);
  if (!item) return null;
  const qtd = item.abastecimento?.quantidade ?? item.quantidade;
  const n = Number(qtd);
  return Number.isFinite(n) ? n : null;
}

/**
 * `idTurno` do JSON da venda (`conteudo.idTurno`) — é o mesmo valor gravado em
 * `tab_fechamento_caixa_pdv.id_origem` no EMSys3 (confirmado num caso real), a forma confiável de achar o
 * fechamento de caixa exato (`seq_fechamento`) que gerou a venda. Retorna null se o JSON não puder ser lido
 * ou não tiver o campo.
 */
export function idTurnoDaVenda(conteudoJson: string): number | null {
  let obj: any;
  try { obj = JSON.parse(conteudoJson); } catch { return null; }
  const n = Number(obj?.idTurno);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function classificarErro(
  retornoBruto: string,
  requisicao: string | null,
  almox: Map<number, InfoAlmoxarifado> | null,
  /** JSON `conteudo` da venda, se disponível — corrige a "baixa" do detalhe pela quantidade real da venda. */
  conteudoJson?: string | null,
  /** Saldo real consultado agora no EMSys3 (sp_obtem_saldo_item_qtde), se disponível — o "SALDO = ..." do
   *  texto do erro é o saldo QUE HAVIA no momento da tentativa e nunca muda depois; sem isso o detalhe
   *  mostra sempre o mesmo número mesmo após o operador lançar uma entrada/medição real no EMSys3. */
  saldoRealOverride?: number | null,
): Classificacao {
  const retorno = sanitizarTexto(retornoBruto ?? '');

  // Saldo de estoque insuficiente: combustível (almoxarifado é tanque) x produto de loja
  if (/Saldo Quantidade do item insuficiente/i.test(retorno)) {
    const info = parseSaldoInsuficiente(retorno);
    const nAlmox = info?.almoxarifado ?? almoxarifadoDoErro(retorno);
    const a = nAlmox != null ? almox?.get(nAlmox) : undefined;
    const baixaReal = info && conteudoJson ? quantidadeRealDaVenda(conteudoJson, info.item) : null;
    const saldo = saldoRealOverride ?? info?.saldoMensagem;
    const detalhe = info ? `item ${info.item} · saldo ${br(saldo!)} · baixa ${br(baixaReal ?? info.quantidadeBaixa)}` : '';
    if (a?.ind_tanque === 'S') {
      const tq = a.num_tanque != null ? `Tanque ${String(a.num_tanque).padStart(2, '0')}` : 'Tanque';
      return { categoria: 'Saldo insuficiente · Combustível', causa: `${tq} · ${cap(a.des_item)} (almox. ${nAlmox})`, detalhe, risco: 'alto', almox: nAlmox ?? undefined };
    }
    if (a) {
      return { categoria: 'Saldo insuficiente · Produto de loja', causa: `${cap(a.des_almoxarifado) || 'Almoxarifado'} (almox. ${nAlmox})`, detalhe, risco: 'medio', almox: nAlmox ?? undefined };
    }
    // Sem consulta ao EMSys3: mantém o tipo, sem separar combustível de loja
    return { categoria: 'Saldo insuficiente', causa: nAlmox != null ? `Almoxarifado ${nAlmox}` : 'Almoxarifado não identificado', detalhe, risco: 'medio', almox: nAlmox ?? undefined };
  }

  if (requisicao === 'venda_atualizanf' && /Venda nao encontrada/i.test(retorno)) {
    return { categoria: 'Venda não encontrada · Atualiza NF', causa: 'Venda inexistente no EMSys3', detalhe: (retorno.match(/ID = \s*(\d+)/i)?.[0] ?? '').replace(/\s+/g, ' '), risco: 'medio' };
  }
  if (requisicao === 'venda_cancela' && /Venda nao encontrad/i.test(retorno)) {
    return { categoria: 'Venda não encontrada · Cancelamento', causa: 'Venda inexistente no EMSys3', detalhe: retorno.match(/ID: \s*(\d+)/i)?.[0] ?? '', risco: 'medio' };
  }
  if (/saldo de adiantamento/i.test(retorno)) {
    return { categoria: CATEGORIA_SALDO_ADIANTAMENTO, causa: 'Financeiro da venda', detalhe: retorno.match(/Cliente Cod\.: (\d+)/i)?.[0] ?? '', risco: 'medio' };
  }

  // Sem regra: agrupa pela assinatura da 1ª linha da mensagem
  const cabeca = retorno.split('###')[0].split('\n')[0];
  const familia = normalizarErro(cabeca)
    // Erros de integrações Java chegam embrulhados na exceção; o que interessa é a mensagem do banco
    .replace(/^(?:[a-z0-9_.]+exception:\s*)+(?:erro:\s*)?/i, '')
    .replace(/<(n|data)>/g, '#')
    .replace(/<txt>/g, '…')
    .slice(0, MAX_LISTA)
    .trim();
  return { categoria: `Outros · ${familia || 'sem mensagem'}`, causa: 'Sem classificação', detalhe: cabeca.slice(0, 80), risco: 'medio' };
}
