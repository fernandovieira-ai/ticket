import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { sanitizeText } from "@/lib/sanitize-text";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  let body: { titulo?: string; descricao?: string; dta_validade?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { titulo, descricao, dta_validade } = body;
  if (!titulo || !descricao) {
    return NextResponse.json({ error: "Título e descrição são obrigatórios" }, { status: 400 });
  }

  // Sanitizar caracteres especiais para compatibilidade com LATIN1
  const tituloSanitizado = sanitizeText(titulo.trim());
  const descricaoSanitizada = sanitizeText(descricao.trim());

  const result = await query(
    `UPDATE intranet.informativos
     SET titulo = $1, descricao = $2, dta_validade = $3
     WHERE id = $4
     RETURNING *`,
    [tituloSanitizado, descricaoSanitizada, dta_validade || null, id]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: "Informativo não encontrado" }, { status: 404 });
  }

  return NextResponse.json(result[0]);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const result = await query(
    "DELETE FROM intranet.informativos WHERE id = $1 RETURNING id",
    [id]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: "Informativo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
