import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const empresaId =
    session?.empresaId ?? "00000000-0000-0000-0000-000000000001";

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fim    = searchParams.get("fim");

  const params: unknown[] = [empresaId];
  let idx = 2;
  const dateCond: string[] = [];
  if (inicio) { dateCond.push(`t.criado_em >= $${idx++}`); params.push(inicio); }
  if (fim)    { dateCond.push(`t.criado_em <= $${idx++}`); params.push(fim); }
  const dw = dateCond.length > 0 ? `AND ${dateCond.join(" AND ")}` : "";

  const [kpisRows, porDia, porStatus, porCanal, porCategoria, topClientes] =
    await Promise.all([
      // KPIs gerais
      query<{
        total: number;
        abertos: number;
        em_andamento: number;
        resolvidos_hoje: number;
        violacoes_sla: number;
        tempo_medio_h: number | null;
        tickets_whatsapp: number;
      }>(
        `SELECT
           COUNT(*)::int                                                          AS total,
           COUNT(*) FILTER (WHERE ts.codigo = 'aberto')::int                     AS abertos,
           COUNT(*) FILTER (WHERE ts.codigo = 'em_andamento')::int               AS em_andamento,
           COUNT(*) FILTER (WHERE ts.codigo IN ('finalizado', 'cancelado')
                              AND t.atualizado_em >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'))::int AS resolvidos_hoje,
           COUNT(*) FILTER (WHERE t.sla_resolucao_deadline < NOW()
                              AND ts.encerra = false)::int                       AS violacoes_sla,
           ROUND(
             AVG(
               EXTRACT(EPOCH FROM (t.resolvido_em - t.criado_em)) / 3600.0
             ) FILTER (WHERE t.resolvido_em IS NOT NULL)
           , 1)::float                                                           AS tempo_medio_h,
           COUNT(*) FILTER (WHERE t.canal = 'whatsapp')::int                    AS tickets_whatsapp
         FROM tickets t
         JOIN ticket_status ts ON ts.id = t.status_id
         WHERE t.empresa_id = $1 ${dw}`,
        params,
      ),

      // Tickets por dia
      query<{ data: string; total: number }>(
        `SELECT
           DATE(t.criado_em AT TIME ZONE 'America/Sao_Paulo') AS data,
           COUNT(*)::int AS total
         FROM tickets t
         WHERE t.empresa_id = $1 ${dw}
         GROUP BY 1 ORDER BY 1`,
        params,
      ),

      // Por status
      query<{ codigo: string; nome: string; cor: string; total: number }>(
        `SELECT ts.codigo, ts.nome, ts.cor, COUNT(t.id)::int AS total
         FROM tickets t
         JOIN ticket_status ts ON ts.id = t.status_id
         WHERE t.empresa_id = $1 ${dw}
         GROUP BY ts.codigo, ts.nome, ts.cor, ts.ordem
         ORDER BY ts.ordem`,
        params,
      ),

      // Por canal
      query<{ canal: string; total: number }>(
        `SELECT t.canal, COUNT(*)::int AS total
         FROM tickets t
         WHERE t.empresa_id = $1 ${dw}
         GROUP BY t.canal ORDER BY total DESC`,
        params,
      ),

      // Por categoria (top 8)
      query<{ nome: string; total: number }>(
        `SELECT c.nome, COUNT(t.id)::int AS total
         FROM tickets t
         JOIN categorias c ON c.id = t.categoria_id
         WHERE t.empresa_id = $1 ${dw}
         GROUP BY c.nome ORDER BY total DESC
         LIMIT 8`,
        params,
      ),

      // Top clientes (top 6)
      query<{ nome: string; total: number }>(
        `SELECT cl.nome_razao AS nome, COUNT(t.id)::int AS total
         FROM tickets t
         JOIN clientes cl ON cl.id = t.cliente_id
         WHERE t.empresa_id = $1 ${dw}
         GROUP BY cl.nome_razao ORDER BY total DESC
         LIMIT 6`,
        params,
      ),
    ]);

  return NextResponse.json({
    kpis: kpisRows[0] ?? {
      total: 0, abertos: 0, em_andamento: 0,
      resolvidos_hoje: 0, violacoes_sla: 0,
      tempo_medio_h: null, tickets_whatsapp: 0,
    },
    por_dia:       porDia,
    por_status:    porStatus,
    por_canal:     porCanal,
    por_categoria: porCategoria,
    top_clientes:  topClientes,
  });
}
