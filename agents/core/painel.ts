// Marca o registro de origem no painel EMSys Gestão (exchange_emsys_gestao_monitoramento_pend)
// como pronto para reprocessar, depois que a correção foi aprovada/aplicada com sucesso.
// Sem isso, o mesmo "codigo" continua com situacao=3 e reprocessar=false, e a próxima
// varredura o redetecta como se a correção não tivesse funcionado.
import pg from 'pg';
import { obterCliente } from './db';
import { descriptografar } from './crypto';
import { garantirVinculo } from './vinculo';
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
