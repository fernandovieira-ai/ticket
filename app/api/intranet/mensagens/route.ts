import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const rows = await query(
    `SELECT m.id, m.username, m.mensagem, m.criado_em AS created_at,
            (m.imagem IS NOT NULL) AS tem_imagem,
            u.avatar_url
     FROM intranet.mensagens m
     LEFT JOIN usuarios u ON lower(replace(u.nome, ' ', '.')) = lower(m.username)
     ORDER BY m.criado_em DESC
     LIMIT 100`
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: { mensagem?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { mensagem } = body;
  if (!mensagem?.trim()) {
    return NextResponse.json({ error: "Mensagem é obrigatória" }, { status: 400 });
  }

  const rows = await query(
    `INSERT INTO intranet.mensagens (username, mensagem, criado_em, atualizado_em)
     VALUES ($1, $2, NOW(), NOW())
     RETURNING id, username, mensagem, criado_em AS created_at`,
    [session.nome, mensagem.trim()]
  );

  return NextResponse.json(rows[0], { status: 201 });
}
