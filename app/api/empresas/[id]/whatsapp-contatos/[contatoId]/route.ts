import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

// DELETE /api/empresas/[id]/whatsapp-contatos/[contatoId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; contatoId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin")
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { id, contatoId } = await params;

    const deleted = await query(
      `DELETE FROM whatsapp_contatos WHERE id = $1 AND empresa_id = $2 RETURNING id`,
      [contatoId, id],
    );

    if (deleted.length === 0)
      return NextResponse.json(
        { error: "Contato não encontrado" },
        { status: 404 },
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/empresas/[id]/whatsapp-contatos/[contatoId]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
