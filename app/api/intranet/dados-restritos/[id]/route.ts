import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";

// PUT /api/intranet/dados-restritos/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { des_projeto, des_funcao, des_complemento, des_link } = body;

  if (!des_projeto || !des_funcao) {
    return NextResponse.json({ error: "Projeto e Função são obrigatórios" }, { status: 400 });
  }

  const result = await queryIntranet(
    `UPDATE intranet.dados_restrito
     SET des_projeto = $1, des_funcao = $2, des_complemento = $3, des_link = $4
     WHERE id = $5 RETURNING *`,
    [des_projeto, des_funcao, des_complemento ?? null, des_link ?? null, parseInt(id)]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

// DELETE /api/intranet/dados-restritos/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  await queryIntranet(`DELETE FROM intranet.dados_restrito WHERE id = $1`, [parseInt(id)]);

  return NextResponse.json({ ok: true });
}
