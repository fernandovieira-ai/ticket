import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/whatsapp/qa-base
// Lista pares Q&A aprovados da empresa
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const categoria = req.nextUrl.searchParams.get("categoria");
  const semEmbedding = req.nextUrl.searchParams.get("sem_embedding") === "true";

  const rows = await query<{
    id: string;
    categoria: string;
    pergunta_exemplo: string;
    resposta_template: string;
    tags: string[];
    aprovado: boolean;
    ativo: boolean;
    usos_total: number;
    acertos: number;
    erros: number;
    score_confianca: number | null;
    versao: number;
    origem: string;
    embedding_gerado_at: string | null;
    criado_at: string;
    atualizado_at: string;
  }>(
    `SELECT id,
            limpar_latin1(categoria)::TEXT       AS categoria,
            limpar_latin1(pergunta_exemplo)::TEXT AS pergunta_exemplo,
            limpar_latin1(resposta_template)::TEXT AS resposta_template,
            tags, aprovado, ativo, usos_total, acertos, erros,
            score_confianca, versao, origem,
            embedding_gerado_at, criado_at, atualizado_at
     FROM grupos_qa_base
     WHERE ativo = TRUE
       ${categoria ? "AND categoria = $1" : ""}
       ${semEmbedding ? "AND embedding_pergunta IS NULL" : ""}
     ORDER BY categoria ASC, usos_total DESC`,
    categoria ? [categoria] : [],
  );

  return NextResponse.json(rows);
}

// POST /api/whatsapp/qa-base
// Cria novo par Q&A (pendente de aprovação ou já aprovado se admin)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json() as {
    categoria: string;
    pergunta_exemplo: string;
    resposta_template: string;
    tags?: string[];
    aprovado?: boolean;
  };

  if (!body.categoria?.trim() || !body.pergunta_exemplo?.trim() || !body.resposta_template?.trim())
    return NextResponse.json({ error: "categoria, pergunta_exemplo e resposta_template são obrigatórios" }, { status: 400 });

  const aprovado = session.perfil === "admin" ? (body.aprovado ?? false) : false;
  const aprovadoPor = aprovado ? session.nome : null;
  const aprovadoAt = aprovado ? "NOW()" : null;

  const [novo] = await query<{ id: string }>(
    `INSERT INTO grupos_qa_base
       (categoria, pergunta_exemplo, resposta_template, tags, aprovado, aprovado_por, aprovado_at, origem)
     VALUES ($1, $2, $3, $4, $5, $6, ${aprovadoAt ? "NOW()" : "NULL"}, 'manual')
     RETURNING id`,
    [
      body.categoria.trim(),
      body.pergunta_exemplo.trim(),
      body.resposta_template.trim(),
      body.tags ?? [],
      aprovado,
      aprovadoPor,
    ],
  );

  return NextResponse.json({ id: novo.id, aprovado }, { status: 201 });
}
