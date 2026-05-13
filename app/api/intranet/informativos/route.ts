import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const result = await query(
    "SELECT * FROM intranet.informativos ORDER BY criado_em DESC"
  );
  return NextResponse.json(result.rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

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

  const result = await query(
    `INSERT INTO intranet.informativos (titulo, descricao, dta_validade)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [titulo.trim(), descricao.trim(), dta_validade || null]
  );

  return NextResponse.json(result.rows[0], { status: 201 });
}
