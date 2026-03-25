import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// GET /api/whatsapp/grupos/[id]/analises
// Retorna histórico de análises IA do grupo
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const grupo = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_grupos WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  const sp    = req.nextUrl.searchParams;
  const page  = Math.max(1, parseInt(sp.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") ?? "10")));
  const offset = (page - 1) * limit;

  const [totalRow] = await query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM whatsapp_grupos_analises
     WHERE grupo_id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );

  const analises = await query<{
    id: string;
    periodo_inicio: string;
    periodo_fim: string;
    total_mensagens: number;
    total_participantes: number;
    resumo: string;
    sentimento: string;
    score_sentimento: number;
    topicos: unknown;
    alertas: unknown;
    criado_em: string;
  }>(
    `SELECT id, periodo_inicio, periodo_fim, total_mensagens, total_participantes,
            resumo, sentimento, score_sentimento, topicos, alertas, criado_em
     FROM whatsapp_grupos_analises
     WHERE grupo_id = $1 AND empresa_id = $2
     ORDER BY criado_em DESC
     LIMIT $3 OFFSET $4`,
    [id, session.empresaId, limit, offset]
  );

  return NextResponse.json({
    data: analises,
    total: parseInt(totalRow?.total ?? "0"),
    page,
    limit,
    pages: Math.ceil(parseInt(totalRow?.total ?? "0") / limit),
  });
}
