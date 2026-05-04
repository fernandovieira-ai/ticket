import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { gerarEmbedding } from "@/lib/ia";

// POST /api/whatsapp/qa-base/gerar-embeddings
// Gera embeddings para todos os pares Q&A aprovados sem embedding.
// Usa sanitizar_para_embedding() do banco para limpar o texto (latin1 → ASCII) antes de enviar à OpenAI.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (session.perfil !== "admin")
    return NextResponse.json({ error: "Apenas admin pode gerar embeddings" }, { status: 403 });

  // Busca pares aprovados sem embedding, já sanitizados para UTF-8/ASCII
  const pendentes = await query<{ id: string; texto: string }>(
    `SELECT id, sanitizar_para_embedding(pergunta_exemplo) AS texto
     FROM grupos_qa_base
     WHERE aprovado = TRUE AND ativo = TRUE AND embedding_pergunta IS NULL
     ORDER BY criado_at`,
  );

  if (pendentes.length === 0)
    return NextResponse.json({ mensagem: "Nenhum Q&A sem embedding.", atualizados: 0 });

  let atualizados = 0;
  const erros: string[] = [];

  for (const row of pendentes) {
    const embedding = await gerarEmbedding(row.texto, session.empresaId);
    if (!embedding) {
      erros.push(`id=${row.id}: falha ao gerar embedding (verifique Config → IA → OpenAI API Key)`);
      continue;
    }

    const vetorLiteral = `{${embedding.join(",")}}`;
    await query(
      `UPDATE grupos_qa_base
       SET embedding_pergunta = $2::float8[],
           embedding_gerado_at = NOW(),
           atualizado_at = NOW()
       WHERE id = $1`,
      [row.id, vetorLiteral],
    );
    atualizados++;
  }

  const [{ total }] = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM grupos_qa_base WHERE embedding_pergunta IS NOT NULL AND ativo = TRUE`,
  );

  return NextResponse.json({
    atualizados,
    total_com_embedding: parseInt(total),
    erros: erros.length > 0 ? erros : undefined,
  });
}
