// Saldo real de estoque no EMSys3 — extraído de ajuste-estoque.ts em 29/09/2026 pra `painel-erros.ts`
// poder chamar sem criar import circular (ajuste-estoque.ts e conferir-combustivel.ts já importam de
// painel-erros.ts; painel-erros.ts importando de volta de ajuste-estoque.ts fecharia um ciclo).
import pg from 'pg';

/**
 * Saldo real do item: chama a PRÓPRIA function do EMSys3 (sp_obtem_saldo_item_qtde) em vez de reimplementar
 * a fórmula — é a function que a trigger fc_tbi_tab_movimento_estoque usa pra checar o saldo antes de
 * aceitar a venda (ver lição `emsys3_saldo_item_estoque_sp_obtem_saldo` em agente_conhecimento), então
 * chamar ela garante o MESMO resultado que a trigger vai calcular, mesmo que a lógica interna mude no
 * futuro. Reaproveitada por `ajuste-estoque.ts`, `conferir-combustivel.ts` e `painel-erros.ts`.
 */
export async function saldoRealAteData(c: pg.Client, cod_empresa: number, cod_item: number, cod_almoxarifado: number, ateData: string): Promise<number> {
  const r = await c.query(
    `SELECT sp_obtem_saldo_item_qtde($1, $2, $3, $4::date, 'N') AS saldo`,
    [cod_empresa, cod_item, cod_almoxarifado, ateData],
  );
  return Number(r.rows[0]?.saldo ?? 0);
}

/**
 * Mesmo cálculo de `saldoRealAteData`, mas pra VÁRIAS combinações numa ÚNICA ida ao banco (via `UNNEST`)
 * em vez de uma chamada sequencial por combinação — cada chamada sequencial paga uma rodada de rede
 * inteira (o protocolo do Postgres não faz pipeline de query/resposta numa `pg.Client` só), então N
 * combinações sequenciais custam ~N rodadas; em lote custa 1, não importa quantas combinações tenham.
 * Usada por `ajuste-estoque.ts` ao montar a prévia de vários grupos de erro de uma vez.
 */
export async function saldoRealAteDataEmLote(
  c: pg.Client,
  combos: { empresa: number; item: number; almoxarifado: number; data: string }[],
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!combos.length) return mapa;
  const r = await c.query(
    `SELECT v.empresa, v.item, v.almoxarifado, v.data::text AS data,
            sp_obtem_saldo_item_qtde(v.empresa, v.item, v.almoxarifado, v.data, 'N') AS saldo
       FROM UNNEST($1::int[], $2::int[], $3::int[], $4::date[]) AS v(empresa, item, almoxarifado, data)`,
    [combos.map((x) => x.empresa), combos.map((x) => x.item), combos.map((x) => x.almoxarifado), combos.map((x) => x.data)],
  );
  for (const row of r.rows) {
    mapa.set(`${row.empresa}|${row.item}|${row.almoxarifado}|${row.data}`, Number(row.saldo ?? 0));
  }
  return mapa;
}
