import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sanitizeText } from "@/lib/sanitize-text";

// GET /api/solicitacoes/[id]/mensagens
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  // Verificar acesso à solicitação
  const exists = await queryOne<{ id: string }>(
    `SELECT id FROM solicitacoes_internas WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );
  if (!exists)
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const mensagens = await query<{
    id: string;
    corpo: string;
    criado_em: Date;
    autor_id: string;
    autor_nome: string;
    autor_perfil: string;
  }>(
    `SELECT
       m.id, m.corpo, m.criado_em,
       u.id AS autor_id, u.nome AS autor_nome, u.perfil AS autor_perfil
     FROM mensagens_solicitacao m
     JOIN usuarios u ON u.id = m.autor_id
     WHERE m.solicitacao_id = $1
     ORDER BY m.criado_em ASC`,
    [id],
  );

  return NextResponse.json(mensagens);
}

const enviarMensagemSchema = z.object({
  corpo: z.string().min(1).max(10000),
});

// POST /api/solicitacoes/[id]/mensagens
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  // Verificar acesso
  const exists = await queryOne<{ id: string }>(
    `SELECT id FROM solicitacoes_internas WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );
  if (!exists)
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = enviarMensagemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Sanitizar caracteres especiais para compatibilidade com LATIN1
  const corpoSanitizado = sanitizeText(parsed.data.corpo);

  const msg = await queryOne<{
    id: string;
    corpo: string;
    criado_em: Date;
  }>(
    `INSERT INTO mensagens_solicitacao (solicitacao_id, autor_id, corpo)
     VALUES ($1, $2, $3)
     RETURNING id, corpo, criado_em`,
    [id, session.sub, corpoSanitizado],
  );

  return NextResponse.json(
    {
      ...msg,
      autor_id: session.sub,
      autor_nome: session.nome,
      autor_perfil: session.perfil,
    },
    { status: 201 },
  );
}
