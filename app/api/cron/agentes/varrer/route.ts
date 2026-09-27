// Cron: GET /api/cron/agentes/varrer
// Schedule: */30 * * * *  (a cada 30 minutos)
// Headers : x-cron-secret=<CRON_SECRET>
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { varrerClientes } from '@/agents/orchestrator/varrer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  const inicio = Date.now();

  // Busca todas as empresas com agente ativo e pelo menos um cliente configurado
  const empresas = await query<{ empresa_id: string }>(
    `SELECT DISTINCT ac.empresa_id
     FROM agente_config ac
     JOIN agente_clientes acl ON acl.empresa_id = ac.empresa_id
     WHERE ac.ativo = TRUE AND acl.ativo = TRUE
       AND (acl.query_erros IS NOT NULL OR acl.analise_painel = TRUE)`,
    [],
  );

  const resultados: Array<{
    empresa_id: string;
    total_analisados: number;
    detalhes: unknown[];
    erro?: string;
  }> = [];

  for (const { empresa_id } of empresas) {
    try {
      const detalhes = await varrerClientes(empresa_id);
      const total_analisados = detalhes.reduce((s, r) => s + r.erros_analisados, 0);
      resultados.push({ empresa_id, total_analisados, detalhes });
    } catch (e: any) {
      console.error(`[cron/agentes/varrer] empresa ${empresa_id}:`, e?.message);
      resultados.push({ empresa_id, total_analisados: 0, detalhes: [], erro: e?.message });
    }
  }

  return NextResponse.json({
    ok:               true,
    empresas:         empresas.length,
    total_analisados: resultados.reduce((s, r) => s + r.total_analisados, 0),
    duracao_ms:       Date.now() - inicio,
    resultados,
  });
}
