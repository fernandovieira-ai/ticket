// Marca o registro de origem no painel EMSys Gestão (exchange_emsys_gestao_monitoramento_pend)
// como pronto para reprocessar, depois que a correção foi aprovada/aplicada com sucesso.
// Sem isso, o mesmo "codigo" continua com situacao=3 e reprocessar=false, e a próxima
// varredura o redetecta como se a correção não tivesse funcionado.
import pg from 'pg';
import { obterCliente } from './db';
import { descriptografar } from './crypto';
import { garantirVinculo, type ConexaoCfg } from './vinculo';
import type { AgenteProposta } from './types';

export async function marcarReprocessarPainel(
  empresa_id: string,
  proposta: AgenteProposta,
): Promise<void> {
  if (!proposta.painel_codigo || !proposta.cliente_id) return;

  const cliente = await obterCliente(proposta.cliente_id, empresa_id).catch(() => null);
  if (!cliente) return;

  const vinculo = await garantirVinculo(cliente.id, empresa_id);
  if (!vinculo.ok) {
    console.error(`[painel] reprocessar NÃO marcado (${cliente.nome}) — vínculo AS x EMSys3 não validado: ${vinculo.erro}`);
    return;
  }

  const pgClient = new pg.Client({
    host: cliente.db_host, port: cliente.db_porta, database: cliente.db_nome,
    user: cliente.db_usuario, password: descriptografar(cliente.db_senha),
    connectionTimeoutMillis: 8000, ssl: false,
  });

  try {
    await pgClient.connect();
    // codigo é bigint no schema do painel — cast explícito, pg não converte text->bigint implicitamente
    await pgClient.query(
      `UPDATE exchange_emsys_gestao_monitoramento_pend SET reprocessar = true WHERE codigo = $1::bigint`,
      [proposta.painel_codigo],
    );
    console.log(`[painel] reprocessar=true marcado para codigo=${proposta.painel_codigo} (${cliente.nome})`);
  } catch (e: any) {
    console.error(`[painel] falha ao marcar reprocessar (codigo=${proposta.painel_codigo}):`, e?.message);
  } finally {
    await pgClient.end().catch(() => {});
  }
}

/**
 * Marca vários códigos do painel como reprocessar = true (é a ÚNICA escrita permitida nas bases do cliente
 * pelo Painel de Erros). Só toca linhas que ainda estão pendentes; `ignorados` = já resolvidas ou reprocessadas.
 */
export async function marcarReprocessarCodigos(
  as: ConexaoCfg,
  codigos: string[],
): Promise<{ marcados: number; ignorados: number }> {
  const ids = [...new Set(codigos)].filter((c) => /^\d{1,18}$/.test(c));
  if (!ids.length) return { marcados: 0, ignorados: 0 };

  const c = new pg.Client({
    host: as.db_host, port: as.db_porta, database: as.db_nome, user: as.db_usuario, password: as.db_senha,
    connectionTimeoutMillis: 8000, ssl: false, statement_timeout: 20000, query_timeout: 25000,
  });
  await c.connect();
  try {
    await c.query('BEGIN');
    // codigo é bigint no schema do painel — cast explícito
    const r = await c.query(
      `UPDATE exchange_emsys_gestao_monitoramento_pend
          SET reprocessar = true
        WHERE codigo = ANY($1::bigint[]) AND situacao = 3 AND (reprocessar IS NULL OR reprocessar = false)`,
      [ids],
    );
    await c.query('COMMIT');
    const marcados = r.rowCount ?? 0;
    return { marcados, ignorados: ids.length - marcados };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await c.end().catch(() => {});
  }
}

export interface SituacaoPainel {
  situacao: number | null;
  reprocessar: boolean;
}

/**
 * Situação ATUAL das linhas do painel (por código), inclusive as que já saíram da fila de erros —
 * usado para confirmar se uma correção aplicada realmente resolveu. Retorna null se não conseguiu
 * consultar (o chamador trata como "não sei" e não confirma nada).
 */
export async function situacaoCodigosPainel(
  cliente: { db_host: string; db_porta: number; db_nome: string; db_usuario: string; db_senha: string },
  codigos: string[],
): Promise<Map<string, SituacaoPainel> | null> {
  if (codigos.length === 0) return new Map();

  const pgClient = new pg.Client({
    host: cliente.db_host, port: cliente.db_porta, database: cliente.db_nome,
    user: cliente.db_usuario, password: descriptografar(cliente.db_senha),
    connectionTimeoutMillis: 8000, ssl: false,
  });

  try {
    await pgClient.connect();
    const r = await pgClient.query(
      `SELECT codigo::text AS codigo, situacao, COALESCE(reprocessar, false) AS reprocessar
         FROM exchange_emsys_gestao_monitoramento_pend
        WHERE codigo = ANY($1::bigint[])`,
      [codigos],
    );
    return new Map(r.rows.map((x: any) => [String(x.codigo), { situacao: x.situacao == null ? null : Number(x.situacao), reprocessar: !!x.reprocessar }]));
  } catch (e: any) {
    console.error('[painel] falha ao consultar situação dos códigos:', e?.message);
    return null;
  } finally {
    await pgClient.end().catch(() => {});
  }
}
