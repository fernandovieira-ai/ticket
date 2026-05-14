import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";

// GET /api/intranet/dtef
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const result = await queryIntranet(
    `SELECT id, cnpj, loja, senha, observacoes FROM intranet.dtef ORDER BY loja`
  );
  return NextResponse.json(result.rows);
}

// POST /api/intranet/dtef
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { cnpj, loja, senha, observacoes } = body;

  if (!cnpj) {
    return NextResponse.json({ error: "CNPJ é obrigatório" }, { status: 400 });
  }

  const result = await queryIntranet(
    `INSERT INTO intranet.dtef (cnpj, loja, senha, observacoes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [cnpj, loja ?? null, senha ?? null, observacoes ?? null]
  );

  return NextResponse.json(result.rows[0], { status: 201 });
}
