import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";

// PATCH /api/intranet/faq/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { nom_sistema, des_assunto, des_erro, des_resolucao } = body;

  if (!nom_sistema || !des_assunto) {
    return NextResponse.json({ error: "Sistema e assunto são obrigatórios" }, { status: 400 });
  }

  const row = await queryOne(
    `UPDATE intranet.faq SET nom_sistema=$1, des_assunto=$2, des_erro=$3, des_resolucao=$4
     WHERE id=$5
     RETURNING id, nom_sistema, des_assunto, des_erro, des_resolucao, usuario_cadastro, criado_em,
               (imagem IS NOT NULL OR caminho_arquivo IS NOT NULL) AS tem_imagem`,
    [nom_sistema, des_assunto, des_erro || null, des_resolucao || null, id]
  );
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(row);
}

// DELETE /api/intranet/faq/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  await query("DELETE FROM intranet.faq WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
