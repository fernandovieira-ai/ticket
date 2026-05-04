import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/solicitacoes/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const solicitacao = await queryOne<{
    id: string;
    titulo: string;
    descricao: string | null;
    status: string;
    prazo: string | null;
    fechado_em: Date | null;
    criado_em: Date;
    atualizado_em: Date;
    tipo_id: string;
    tipo_nome: string;
    tipo_icone: string | null;
    tipo_cor: string;
    prioridade_id: string | null;
    prioridade_nome: string | null;
    prioridade_cor: string | null;
    solicitante_id: string;
    solicitante_nome: string;
    responsavel_id: string | null;
    responsavel_nome: string | null;
    departamento_id: string | null;
    departamento_nome: string | null;
    categoria_id: string | null;
    categoria_nome: string | null;
    subcategoria_id: string | null;
    subcategoria_nome: string | null;
  }>(
    `SELECT
       s.id, s.titulo, s.descricao, s.status, s.prazo, s.fechado_em,
       s.criado_em, s.atualizado_em,
       s.tipo_id, st.nome AS tipo_nome, st.icone AS tipo_icone, st.cor AS tipo_cor,
       s.prioridade_id, tp.nome AS prioridade_nome, tp.cor AS prioridade_cor,
       s.solicitante_id, us.nome AS solicitante_nome,
       s.responsavel_id, ur.nome AS responsavel_nome,
       s.departamento_dest AS departamento_id, d.nome AS departamento_nome,
       s.categoria_id, c.nome AS categoria_nome,
       s.subcategoria_id, sc.nome AS subcategoria_nome
     FROM solicitacoes_internas s
     JOIN solicitacao_tipos st ON st.id = s.tipo_id
     LEFT JOIN ticket_prioridades tp ON tp.id = s.prioridade_id
     JOIN usuarios us ON us.id = s.solicitante_id
     LEFT JOIN usuarios ur ON ur.id = s.responsavel_id
     LEFT JOIN departamentos d ON d.id = s.departamento_dest
     LEFT JOIN categorias c ON c.id = s.categoria_id
     LEFT JOIN subcategorias sc ON sc.id = s.subcategoria_id
     WHERE s.id = $1 AND s.empresa_id = $2`,
    [id, session.empresaId],
  );

  if (!solicitacao)
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json(solicitacao);
}

const atualizarSchema = z.object({
  status: z
    .enum(["aberta", "em_andamento", "aguardando", "concluida", "cancelada"])
    .optional(),
  responsavel_id: z.string().uuid().nullable().optional(),
  prioridade_id: z.string().uuid().nullable().optional(),
  departamento_dest: z.string().uuid().nullable().optional(),
  prazo: z.string().nullable().optional(),
  titulo: z.string().min(3).max(200).optional(),
  categoria_id: z.string().uuid().nullable().optional(),
  subcategoria_id: z.string().uuid().nullable().optional(),
});

// PATCH /api/solicitacoes/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  // Verificar que pertence à empresa
  const exists = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM solicitacoes_internas WHERE id = $1 AND empresa_id = $2`,
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

  const parsed = atualizarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  function addField(col: string, val: unknown) {
    updates.push(`${col} = $${idx++}`);
    values.push(val);
  }

  if (parsed.data.status !== undefined) {
    updates.push(`status = $${idx++}::status_solicitacao`);
    values.push(parsed.data.status);
    if (
      parsed.data.status === "concluida" ||
      parsed.data.status === "cancelada"
    ) {
      addField("fechado_em", new Date());
    } else {
      addField("fechado_em", null);
    }
  }
  if (parsed.data.responsavel_id !== undefined)
    addField("responsavel_id", parsed.data.responsavel_id);
  if (parsed.data.prioridade_id !== undefined)
    addField("prioridade_id", parsed.data.prioridade_id);
  if (parsed.data.departamento_dest !== undefined)
    addField("departamento_dest", parsed.data.departamento_dest);
  if (parsed.data.prazo !== undefined)
    addField("prazo", parsed.data.prazo ?? null);
  if (parsed.data.titulo !== undefined) addField("titulo", parsed.data.titulo);
  if (parsed.data.categoria_id !== undefined)
    addField("categoria_id", parsed.data.categoria_id);
  if (parsed.data.subcategoria_id !== undefined)
    addField("subcategoria_id", parsed.data.subcategoria_id);

  if (updates.length === 0)
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });

  values.push(id, session.empresaId);

  try {
    const updated = await queryOne<{ id: string }>(
      `UPDATE solicitacoes_internas SET ${updates.join(", ")}
       WHERE id = $${idx++} AND empresa_id = $${idx}
       RETURNING id`,
      values,
    );

    if (!updated)
      return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  } catch (error: any) {
    console.error("Erro ao atualizar solicitação:", error);

    // Handle foreign key constraint errors specifically
    if (error.code === '23503') {
      if (error.constraint === 'solicitacoes_internas_subcategoria_id_fkey') {
        return NextResponse.json({
          error: "Subcategoria inválida ou constraint de banco incorreta",
          details: "A constraint do banco precisa ser corrigida. Execute a migração de correção.",
          sqlError: error.detail
        }, { status: 400 });
      }

      return NextResponse.json({
        error: "Referência inválida",
        details: error.detail,
        constraint: error.constraint
      }, { status: 400 });
    }

    return NextResponse.json({
      error: "Erro ao atualizar solicitação",
      details: error.message
    }, { status: 500 });
  }

  // Buscar dados atualizados e retornar
  const rows = await query<{ id: string }>(
    `SELECT s.id FROM solicitacoes_internas s WHERE s.id = $1`,
    [id],
  );

  return NextResponse.json({ id: rows[0]?.id ?? id });
}
