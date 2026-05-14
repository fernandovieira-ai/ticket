import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";

// GET /api/intranet/dados-restritos
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const result = await queryIntranet(
    `SELECT id, des_projeto, des_funcao, des_complemento, des_link, criado_em
     FROM intranet.dados_restrito ORDER BY des_projeto, id`
  );
  return NextResponse.json(result.rows);
}

// POST /api/intranet/dados-restritos
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { des_projeto, des_funcao, des_complemento, des_link } = body;

  if (!des_projeto || !des_funcao) {
    return NextResponse.json({ error: "Projeto e Função são obrigatórios" }, { status: 400 });
  }

  const result = await queryIntranet(
    `INSERT INTO intranet.dados_restrito (des_projeto, des_funcao, des_complemento, des_link)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [des_projeto, des_funcao, des_complemento ?? null, des_link ?? null]
  );

  return NextResponse.json(result.rows[0], { status: 201 });
}
