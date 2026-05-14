import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";

// PUT /api/intranet/dtef/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { cnpj, loja, senha, observacoes } = body;

  if (!cnpj) {
    return NextResponse.json({ error: "CNPJ é obrigatório" }, { status: 400 });
  }

  const result = await queryIntranet(
    `UPDATE intranet.dtef
     SET cnpj = $1, loja = $2, senha = $3, observacoes = $4, atualizado_em = NOW()
     WHERE id = $5 RETURNING *`,
    [cnpj, loja ?? null, senha ?? null, observacoes ?? null, parseInt(id)]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

// DELETE /api/intranet/dtef/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  await queryIntranet(
    `DELETE FROM intranet.dtef WHERE id = $1`,
    [parseInt(id)]
  );

  return NextResponse.json({ ok: true });
}
