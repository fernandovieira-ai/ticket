import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";

// PUT /api/intranet/anydesk/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { rede, unidade, host, end_anydesk, senha_anydesk } = body;

  if (!rede || !host || !end_anydesk) {
    return NextResponse.json({ error: "Rede, Host e Endereço AnyDesk são obrigatórios" }, { status: 400 });
  }

  const result = await queryIntranet(
    `UPDATE intranet.anydesk_acessos
     SET rede = $1, unidade = $2, host = $3, end_anydesk = $4, senha_anydesk = $5
     WHERE id = $6 RETURNING *`,
    [rede, unidade ?? null, host, end_anydesk, senha_anydesk ?? null, parseInt(id)]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

// DELETE /api/intranet/anydesk/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  await queryIntranet(
    `DELETE FROM intranet.anydesk_acessos WHERE id = $1`,
    [parseInt(id)]
  );

  return NextResponse.json({ ok: true });
}
