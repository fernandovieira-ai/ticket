// Conferência de saldo de combustível: combustível NUNCA é ajustado pelo Painel de Erros (é medição
// física do tanque, não um dado que o sistema possa inventar) — mas o operador precisa saber, depois de
// lançar a medição/entrada real no EMSys3, se aquilo já é suficiente para reprocessar com sucesso ou se
// ainda vai falhar de novo. Esta consulta só LÊ (mesma fórmula assinada de saldo usada em
// ajuste-estoque.ts) e devolve um veredito por tanque/item — nunca escreve nada, nunca lança entrada.
import pg from 'pg';
import { preparar, novoClient } from './ajuste-pagamento';
import { saldoRealAteData } from './saldo-estoque';
import { classificarErro, parseSaldoInsuficiente, sanitizarTexto, ehCombustivel, type InfoAlmoxarifado } from './classificar';
import { lerLinhasPorCodigo, almoxarifadosDe, codEmpresaPorCnpj, quantidadeRealDaVenda } from './painel-erros';

export interface ItemConferenciaCombustivel {
  /** códigos do painel cobertos por este tanque/item (podem ser vários) */
  codigos: string[];
  /** cod_empresa REAL do EMSys3 (resolvido pelo CNPJ da venda — nunca o código de empresa do lado do AS) */
  empresa: number;
  cod_item: number;
  des_item: string;
  cod_almoxarifado: number;
  des_almoxarifado: string;
  /** saldo real no EMSys3 agora, até a data do erro mais antigo do grupo (mesma data que a trigger confere) */
  saldoReal: number;
  quantidadeNecessaria: number;
  /** > 0 = ainda falta lançar/medir; <= 0 = saldo real já cobre a venda pendente */
  deficit: number;
  dataReferencia: string;
}

export interface ConferenciaCombustivel {
  ok: boolean;
  erro?: string;
  /** tanques/itens que AINDA não têm saldo suficiente — reprocessar agora volta a falhar */
  pendentes: ItemConferenciaCombustivel[];
  /** tanques/itens cujo saldo real já cobre a quantidade da venda — seguro reprocessar */
  prontos: ItemConferenciaCombustivel[];
}

const vazio = (erro: string): ConferenciaCombustivel => ({ ok: false, erro, pendentes: [], prontos: [] });

/** Conferência de saldo real de combustível para os códigos pedidos — só leitura, nunca corrige nada. */
export async function conferirSaldoCombustivel(cliente_id: string, empresa_id: string, codigos: string[]): Promise<ConferenciaCombustivel> {
  const p = await preparar(cliente_id, empresa_id);
  if (!p.ok) return vazio(p.erro);
  if (!p.cfgEm) return vazio('Cliente sem base EMSys3 vinculada — não há como confirmar o saldo real do tanque.');

  const linhas = await lerLinhasPorCodigo(p.cfgAS, codigos);
  if (!linhas.length) return vazio('Esses erros não estão mais pendentes no painel. Atualize a tela.');

  const almox = await almoxarifadosDe(p.cfgEm, linhas.map((l) => l.retorno));
  const foraDaCategoria = linhas.filter((l) => !ehCombustivel(classificarErro(l.retorno, l.requisicao, almox).categoria));
  if (foraDaCategoria.length) {
    return vazio('Um ou mais erros selecionados não são do tipo "saldo insuficiente de combustível". Atualize a tela e selecione de novo.');
  }

  // `l.empresa` é um código do lado do AS, SEM relação com o cod_empresa do EMSys3 (confirmado com dado
  // real: empresa="30351405" no AS correspondia a cod_empresa=105 no EMSys3 — CNPJs bem diferentes). A
  // única forma confiável de achar o cod_empresa real é pelo CNPJ gravado no JSON da própria venda.
  const mapaEmpresa = await codEmpresaPorCnpj(p.cfgEm, linhas.map((l) => l.cnpj));
  const semCnpjResolvido = linhas.filter((l) => !l.cnpj || !mapaEmpresa.has(l.cnpj));
  if (semCnpjResolvido.length) {
    return vazio(`Não foi possível confirmar a empresa EMSys3 (pelo CNPJ) do(s) código(s) ${semCnpjResolvido.slice(0, 5).map((l) => l.codigo).join(', ')}${semCnpjResolvido.length > 5 ? '…' : ''} — o JSON da venda não trouxe um CNPJ que exista em tab_empresa.`);
  }

  type Grupo = { codigos: string[]; empresa: number; item: number; almoxarifado: number; quantidadeNecessaria: number; dataReferencia: string };
  const grupos = new Map<string, Grupo>();
  for (const l of linhas) {
    const info = parseSaldoInsuficiente(l.retorno);
    if (!info) return vazio(`Não foi possível ler os dados (item/tanque/data) do código ${l.codigo}.`);
    const codEmpresa = mapaEmpresa.get(l.cnpj!)!;
    // A quantidade real vem do JSON da própria venda (medição do abastecimento), não do texto do erro —
    // "QUANTIDADE BAIXA" no retorno é só o que a trigger reportou e pode não bater com a venda de verdade.
    const quantidade = quantidadeRealDaVenda(l.conteudo, info.item) ?? info.quantidadeBaixa;
    const chave = `${codEmpresa}|${info.item}|${info.almoxarifado}`;
    const g = grupos.get(chave);
    if (g) {
      g.codigos.push(l.codigo);
      g.quantidadeNecessaria += quantidade;
      if (info.data < g.dataReferencia) g.dataReferencia = info.data;
    } else {
      grupos.set(chave, { codigos: [l.codigo], empresa: codEmpresa, item: info.item, almoxarifado: info.almoxarifado, quantidadeNecessaria: quantidade, dataReferencia: info.data });
    }
  }

  const almoxDesc: Map<number, InfoAlmoxarifado> | null = almox;
  const itensDesc = new Map<number, string>();

  const c: pg.Client = novoClient(p.cfgEm);
  await c.connect();
  try {
    const sch = `"${(p.cfgEm.db_schema || 'public').replace(/"/g, '""')}"`;
    const itensIds = [...new Set([...grupos.values()].map((g) => g.item))];
    if (itensIds.length) {
      const r = await c.query(`SELECT cod_item, des_item FROM ${sch}.tab_item WHERE cod_item = ANY($1::int[])`, [itensIds]);
      for (const row of r.rows) itensDesc.set(Number(row.cod_item), sanitizarTexto(String(row.des_item ?? '')));
    }

    const pendentes: ItemConferenciaCombustivel[] = [];
    const prontos: ItemConferenciaCombustivel[] = [];
    for (const g of grupos.values()) {
      const saldoReal = await saldoRealAteData(c, g.empresa, g.item, g.almoxarifado, g.dataReferencia);
      const deficit = Math.round((g.quantidadeNecessaria - saldoReal) * 100000) / 100000;
      const item: ItemConferenciaCombustivel = {
        codigos: g.codigos, empresa: g.empresa, cod_item: g.item, des_item: itensDesc.get(g.item) ?? `Item ${g.item}`,
        cod_almoxarifado: g.almoxarifado, des_almoxarifado: almoxDesc?.get(g.almoxarifado)?.des_almoxarifado ?? `Tanque ${g.almoxarifado}`,
        saldoReal, quantidadeNecessaria: g.quantidadeNecessaria, deficit, dataReferencia: g.dataReferencia,
      };
      (deficit <= 0 ? prontos : pendentes).push(item);
    }

    return { ok: true, pendentes, prontos };
  } finally {
    await c.end().catch(() => {});
  }
}
