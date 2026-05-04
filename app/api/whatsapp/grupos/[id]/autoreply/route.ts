import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// GET /api/whatsapp/grupos/[id]/autoreply
// Retorna configuração de autoreply do grupo
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const config = await queryOne<{
    autoreply_ativo: boolean;
    autoreply_threshold: number;
    autoreply_delay_seg: number;
    autoreply_categorias: string[];
    autoreply_excluir_grupo: boolean;
    autoreply_horario_inicio: string;
    autoreply_horario_fim: string;
    autoreply_max_por_hora: number;
  }>(
    `SELECT autoreply_ativo, autoreply_threshold, autoreply_delay_seg,
            autoreply_categorias, autoreply_excluir_grupo,
            autoreply_horario_inicio, autoreply_horario_fim, autoreply_max_por_hora
     FROM whatsapp_grupos
     WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );

  if (!config) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  return NextResponse.json(config);
}

// PUT /api/whatsapp/grupos/[id]/autoreply
// Atualiza configuração de autoreply do grupo
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const existente = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_grupos WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );
  if (!existente) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  const body = await req.json() as Record<string, unknown>;
  const campos: string[] = [];
  const valores: unknown[] = [];
  let idx = 1;

  if (typeof body.autoreply_ativo === "boolean") {
    campos.push(`autoreply_ativo = $${idx++}`); valores.push(body.autoreply_ativo);
  }
  if (typeof body.autoreply_threshold === "number") {
    campos.push(`autoreply_threshold = $${idx++}`); valores.push(body.autoreply_threshold);
  }
  if (typeof body.autoreply_delay_seg === "number") {
    campos.push(`autoreply_delay_seg = $${idx++}`); valores.push(body.autoreply_delay_seg);
  }
  if (Array.isArray(body.autoreply_categorias)) {
    campos.push(`autoreply_categorias = $${idx++}`); valores.push(body.autoreply_categorias);
  }
  if (typeof body.autoreply_excluir_grupo === "boolean") {
    campos.push(`autoreply_excluir_grupo = $${idx++}`); valores.push(body.autoreply_excluir_grupo);
  }
  if (typeof body.autoreply_horario_inicio === "string") {
    campos.push(`autoreply_horario_inicio = $${idx++}`); valores.push(body.autoreply_horario_inicio);
  }
  if (typeof body.autoreply_horario_fim === "string") {
    campos.push(`autoreply_horario_fim = $${idx++}`); valores.push(body.autoreply_horario_fim);
  }
  if (typeof body.autoreply_max_por_hora === "number") {
    campos.push(`autoreply_max_por_hora = $${idx++}`); valores.push(body.autoreply_max_por_hora);
  }

  if (campos.length === 0)
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });

  await query(
    `UPDATE whatsapp_grupos SET ${campos.join(", ")} WHERE id = $${idx}`,
    [...valores, id],
  );

  return NextResponse.json({ ok: true });
}
