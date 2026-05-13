import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/intranet/faq
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const rows = await query(
    `SELECT id, nom_sistema, des_assunto, des_erro, des_resolucao,
            usuario_cadastro, criado_em,
            (imagem IS NOT NULL OR caminho_arquivo IS NOT NULL) AS tem_imagem
     FROM intranet.faq ORDER BY criado_em DESC`
  );
  return NextResponse.json(rows);
}

// POST /api/intranet/faq
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { nom_sistema, des_assunto, des_erro, des_resolucao } = body;

  if (!nom_sistema || !des_assunto) {
    return NextResponse.json({ error: "Sistema e assunto são obrigatórios" }, { status: 400 });
  }

  const rows = await query(
    `INSERT INTO intranet.faq (nom_sistema, des_assunto, des_erro, des_resolucao, usuario_cadastro, criado_em)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, nom_sistema, des_assunto, des_erro, des_resolucao, usuario_cadastro, criado_em,
               (imagem IS NOT NULL OR caminho_arquivo IS NOT NULL) AS tem_imagem`,
    [nom_sistema, des_assunto, des_erro || null, des_resolucao || null, session.nome]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
