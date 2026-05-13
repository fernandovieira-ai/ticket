import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  // Verifica se a mensagem existe e pertence ao usuário (ou é admin)
  const check = await query(
    "SELECT username FROM intranet.mensagens WHERE id = $1",
    [id]
  );
  if (check.length === 0) {
    return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
  }
  if ((check[0] as { username: string }).username !== session.nome && session.perfil !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await query("DELETE FROM intranet.mensagens WHERE id = $1", [id]);
  return NextResponse.json({ success: true });
}
