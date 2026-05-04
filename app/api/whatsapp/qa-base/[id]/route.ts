import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// PUT /api/whatsapp/qa-base/[id]
// Atualiza categoria, pergunta, resposta, tags, aprovado, ativo
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const existente = await queryOne<{ id: string }>(
    `SELECT id FROM grupos_qa_base WHERE id = $1 AND ativo = TRUE`,
    [id],
  );
  if (!existente) return NextResponse.json({ error: "Q&A não encontrado" }, { status: 404 });

  const body = await req.json() as Record<string, unknown>;
  const campos: string[] = [];
  const valores: unknown[] = [];
  let idx = 1;

  if (typeof body.categoria === "string" && body.categoria.trim()) {
    campos.push(`categoria = $${idx++}`); valores.push(body.categoria.trim());
  }
  if (typeof body.pergunta_exemplo === "string" && body.pergunta_exemplo.trim()) {
    campos.push(`pergunta_exemplo = $${idx++}`); valores.push(body.pergunta_exemplo.trim());
    // Invalida embedding anterior pois o texto mudou
    campos.push(`embedding_pergunta = NULL`);
    campos.push(`embedding_gerado_at = NULL`);
  }
  if (typeof body.resposta_template === "string" && body.resposta_template.trim()) {
    campos.push(`resposta_template = $${idx++}`); valores.push(body.resposta_template.trim());
  }
  if (Array.isArray(body.tags)) {
    campos.push(`tags = $${idx++}`); valores.push(body.tags);
  }
  if (typeof body.aprovado === "boolean") {
    campos.push(`aprovado = $${idx++}`); valores.push(body.aprovado);
    if (body.aprovado) {
      campos.push(`aprovado_por = $${idx++}`); valores.push(session.nome);
      campos.push(`aprovado_at = NOW()`);
    }
  }
  if (typeof body.ativo === "boolean") {
    campos.push(`ativo = $${idx++}`); valores.push(body.ativo);
  }

  if (campos.length === 0)
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });

  await query(
    `UPDATE grupos_qa_base SET ${campos.join(", ")} WHERE id = $${idx}`,
    [...valores, id],
  );

  return NextResponse.json({ ok: true });
}

// DELETE /api/whatsapp/qa-base/[id]
// Desativa (soft delete) o par Q&A
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (session.perfil !== "admin")
    return NextResponse.json({ error: "Apenas admin pode excluir" }, { status: 403 });

  const { id } = await params;

  const existente = await queryOne<{ id: string }>(
    `SELECT id FROM grupos_qa_base WHERE id = $1`,
    [id],
  );
  if (!existente) return NextResponse.json({ error: "Q&A não encontrado" }, { status: 404 });

  await query(`UPDATE grupos_qa_base SET ativo = FALSE WHERE id = $1`, [id]);

  return NextResponse.json({ ok: true });
}
