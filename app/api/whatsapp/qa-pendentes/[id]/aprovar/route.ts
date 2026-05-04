import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { gerarEmbedding } from "@/lib/ia";

type Params = { params: Promise<{ id: string }> };

// POST /api/whatsapp/qa-pendentes/[id]/aprovar
// Aprova o item pendente: cria registro em grupos_qa_base e gera embedding
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const pendente = await queryOne<{
    id: string;
    categoria_sugerida: string | null;
    pergunta_original: string;
    resposta_original: string;
    pergunta_editada: string | null;
    resposta_editada: string | null;
    grupo_id: string;
    mensagem_cliente_id: string | null;
    mensagem_operador_id: string | null;
    confianca_extracao: string;
    status: string;
  }>(
    `SELECT id, categoria_sugerida, pergunta_original, resposta_original,
            pergunta_editada, resposta_editada, grupo_id,
            mensagem_cliente_id, mensagem_operador_id, confianca_extracao, status
     FROM grupos_qa_pendentes WHERE id = $1`,
    [id],
  );

  if (!pendente) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  if (pendente.status !== "pendente")
    return NextResponse.json({ error: "Item já foi revisado" }, { status: 409 });

  // Corpo opcional: permite editar antes de aprovar
  let body: { categoria?: string; pergunta?: string; resposta?: string } = {};
  try { body = await req.json(); } catch { /* sem body */ }

  const categoria = body.categoria?.trim() || pendente.categoria_sugerida || "Geral";
  const pergunta = body.pergunta?.trim() || pendente.pergunta_editada || pendente.pergunta_original;
  const resposta = body.resposta?.trim() || pendente.resposta_editada || pendente.resposta_original;

  // Insere na base aprovada
  const [novo] = await query<{ id: string }>(
    `INSERT INTO grupos_qa_base
       (categoria, pergunta_exemplo, resposta_template, aprovado, aprovado_por, aprovado_at,
        origem, grupo_origem_id, mensagem_cliente_id, mensagem_operador_id, extracao_confianca)
     VALUES ($1, $2, $3, TRUE, $4, NOW(), 'extracao_ia', $5, $6, $7, $8)
     RETURNING id`,
    [
      categoria,
      pergunta,
      resposta,
      session.nome,
      pendente.grupo_id,
      pendente.mensagem_cliente_id,
      pendente.mensagem_operador_id,
      pendente.confianca_extracao,
    ],
  );

  // Atualiza pendente como aprovado
  await query(
    `UPDATE grupos_qa_pendentes
     SET status = 'aprovado', revisado_por = $2, revisado_at = NOW(), qa_base_id = $3
     WHERE id = $1`,
    [id, session.nome, novo.id],
  );

  // Tenta gerar embedding imediatamente (melhor esforço)
  let embeddingGerado = false;
  try {
    const [{ texto }] = await query<{ texto: string }>(
      `SELECT sanitizar_para_embedding(pergunta_exemplo) AS texto
       FROM grupos_qa_base WHERE id = $1`,
      [novo.id],
    );
    const embedding = await gerarEmbedding(texto, session.empresaId);
    if (embedding) {
      await query(
        `UPDATE grupos_qa_base
         SET embedding_pergunta = $2::float8[], embedding_gerado_at = NOW()
         WHERE id = $1`,
        [novo.id, `{${embedding.join(",")}}`],
      );
      embeddingGerado = true;
    }
  } catch {
    // Embedding falhou — pode gerar depois via /qa-base/gerar-embeddings
  }

  return NextResponse.json({ ok: true, qa_base_id: novo.id, embedding_gerado: embeddingGerado });
}
