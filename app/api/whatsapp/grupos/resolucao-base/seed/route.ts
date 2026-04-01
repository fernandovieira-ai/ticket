import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { gerarEmbedding } from "@/lib/ia";

// POST /api/whatsapp/grupos/resolucao-base/seed
// Gera e salva embeddings para todos os registros da base de conhecimento
// que ainda não possuem embedding.
// Deve ser chamado uma vez após rodar a migração v1.11.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Apenas admins
  if (session.perfil !== "admin") {
    return NextResponse.json({ error: "Permissão insuficiente" }, { status: 403 });
  }

  // Busca registros sem embedding
  const pendentes = await query<{ id: string; conteudo: string }>(
    `SELECT id, conteudo
     FROM grupos_resolucao_base
     WHERE embedding IS NULL AND ativo = TRUE
     ORDER BY criado_em`,
  );

  if (pendentes.length === 0) {
    return NextResponse.json({ mensagem: "Nenhum registro sem embedding.", atualizados: 0 });
  }

  let atualizados = 0;
  const erros: string[] = [];

  for (const row of pendentes) {
    const embedding = await gerarEmbedding(row.conteudo);
    if (!embedding) {
      erros.push(`id=${row.id}: falha ao gerar embedding (verifique OPENAI_API_KEY)`);
      continue;
    }

    const vetorLiteral = `{${embedding.join(",")}}`;
    await query(
      `UPDATE grupos_resolucao_base
       SET embedding = $2::float8[], atualizado_em = NOW()
       WHERE id = $1`,
      [row.id, vetorLiteral],
    );
    atualizados++;
  }

  const { count } = (await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM grupos_resolucao_base WHERE embedding IS NOT NULL`,
  ))[0] ?? { count: "0" };

  return NextResponse.json({
    atualizados,
    erros: erros.length > 0 ? erros : undefined,
    total_com_embedding: parseInt(count),
  });
}
