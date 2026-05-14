import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";
import { encryptPassword, decryptPassword } from "../route";

// PUT /api/intranet/hospedagem/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { nom_base, nom_host, nom_usuario, sen_senha } = body;

  if (!nom_base || !nom_host) {
    return NextResponse.json({ error: "Base e host são obrigatórios" }, { status: 400 });
  }

  const senhaEncrypted = sen_senha ? encryptPassword(sen_senha) : null;

  const result = await queryIntranet(
    `UPDATE intranet.hospedagem
     SET nom_base = $1, nom_host = $2, nom_usuario = $3, sen_senha = $4, atualizado_em = NOW()
     WHERE id = $5 RETURNING *`,
    [nom_base, nom_host, nom_usuario ?? null, senhaEncrypted, parseInt(id)]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const row = result.rows[0];
  return NextResponse.json({
    ...row,
    senha_decrypted: row.sen_senha ? decryptPassword(row.sen_senha) : null,
  });
}

// DELETE /api/intranet/hospedagem/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  await queryIntranet(
    `DELETE FROM intranet.hospedagem WHERE id = $1`,
    [parseInt(id)]
  );

  return NextResponse.json({ ok: true });
}
