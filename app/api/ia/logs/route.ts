import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(
    50,
    Math.max(5, Number(searchParams.get("pageSize") ?? 20)),
  );
  const tipo = searchParams.get("tipo") ?? "";
  const offset = (page - 1) * pageSize;

  const rows = await query<{
    id: number;
    ticket_id: string | null;
    ticket_numero: string | null;
    usuario_id: string | null;
    usuario_nome: string | null;
    tipo: string;
    prompt_resumido: string | null;
    resposta: string | null;
    tokens_entrada: number | null;
    tokens_saida: number | null;
    latencia_ms: number | null;
    confianca: number | null;
    usado: boolean;
    criado_em: Date;
    total_count: number;
  }>(
    `SELECT
       l.id, l.ticket_id, l.usuario_id, l.tipo,
       l.prompt_resumido, l.resposta,
       l.tokens_entrada, l.tokens_saida, l.latencia_ms, l.confianca,
       l.usado, l.criado_em,
       t.numero AS ticket_numero,
       u.nome AS usuario_nome,
       COUNT(*) OVER() AS total_count
     FROM ia_logs l
     LEFT JOIN tickets t ON t.id = l.ticket_id
     LEFT JOIN usuarios u ON u.id = l.usuario_id
     WHERE l.empresa_id = $1
       AND ($2 = '' OR l.tipo = $2)
     ORDER BY l.criado_em DESC
     LIMIT $3 OFFSET $4`,
    [session.empresaId, tipo, pageSize, offset],
  );

  const total = rows[0]?.total_count ?? 0;

  // Estatísticas do dia
  const stats = await queryOne<{
    total_hoje: number;
    tokens_hoje: number;
    custo_estimado: number;
  }>(
    `SELECT
       COUNT(*)::int AS total_hoje,
       COALESCE(SUM(tokens_entrada + tokens_saida), 0)::int AS tokens_hoje,
       ROUND(COALESCE(SUM((tokens_entrada * 0.000003 + tokens_saida * 0.000015)), 0)::numeric, 4) AS custo_estimado
     FROM ia_logs
     WHERE empresa_id = $1
       AND criado_em >= NOW() - INTERVAL '24 hours'`,
    [session.empresaId],
  );

  return NextResponse.json({
    data: rows.map(({ total_count: _, ...r }) => r),
    total: Number(total),
    page,
    pageSize,
    stats: stats ?? { total_hoje: 0, tokens_hoje: 0, custo_estimado: 0 },
  });
}
