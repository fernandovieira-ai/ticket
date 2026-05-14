import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";

// PUT /api/intranet/dados-restritos/projeto  — renomear projeto
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { old_nome, new_nome } = await req.json();
  if (!old_nome || !new_nome) {
    return NextResponse.json({ error: "old_nome e new_nome são obrigatórios" }, { status: 400 });
  }

  await queryIntranet(
    `UPDATE intranet.dados_restrito SET des_projeto = $1 WHERE des_projeto = $2`,
    [new_nome, old_nome]
  );

  return NextResponse.json({ ok: true });
}

// DELETE /api/intranet/dados-restritos/projeto?nome=X — excluir todos os itens do projeto
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const nome = searchParams.get("nome");
  if (!nome) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });

  await queryIntranet(`DELETE FROM intranet.dados_restrito WHERE des_projeto = $1`, [nome]);

  return NextResponse.json({ ok: true });
}
