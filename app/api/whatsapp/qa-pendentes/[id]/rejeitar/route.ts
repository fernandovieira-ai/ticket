import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// POST /api/whatsapp/qa-pendentes/[id]/rejeitar
// Rejeita item da fila de aprovação
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const pendente = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM grupos_qa_pendentes WHERE id = $1`,
    [id],
  );

  if (!pendente) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  if (pendente.status !== "pendente")
    return NextResponse.json({ error: "Item já foi revisado" }, { status: 409 });

  let motivo: string | null = null;
  try {
    const body = await req.json() as { motivo?: string };
    motivo = body.motivo?.trim() ?? null;
  } catch { /* sem body */ }

  await query(
    `UPDATE grupos_qa_pendentes
     SET status = 'rejeitado', revisado_por = $2, revisado_at = NOW(), motivo_rejeicao = $3
     WHERE id = $1`,
    [id, session.nome, motivo],
  );

  return NextResponse.json({ ok: true });
}
