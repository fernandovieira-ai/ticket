import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";

// GET /api/intranet/anydesk
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const result = await queryIntranet(
    `SELECT id, rede, unidade, host, end_anydesk, senha_anydesk, criado_em
     FROM intranet.anydesk_acessos ORDER BY rede, unidade`
  );
  return NextResponse.json(result.rows);
}

// POST /api/intranet/anydesk
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { rede, unidade, host, end_anydesk, senha_anydesk } = body;

  if (!rede || !host || !end_anydesk) {
    return NextResponse.json({ error: "Rede, Host e Endereço AnyDesk são obrigatórios" }, { status: 400 });
  }

  const result = await queryIntranet(
    `INSERT INTO intranet.anydesk_acessos (rede, unidade, host, end_anydesk, senha_anydesk)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [rede, unidade ?? null, host, end_anydesk, senha_anydesk ?? null]
  );

  return NextResponse.json(result.rows[0], { status: 201 });
}
