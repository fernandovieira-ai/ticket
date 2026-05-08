import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Categoria } from "@/types";

// GET /api/categorias
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const departamentoId = searchParams.get("departamento_id") ?? "";
  const visivelCliente = searchParams.get("visivel_cliente") ?? "";
  const pageSize = Math.min(
    parseInt(searchParams.get("pageSize") ?? "50"),
    200,
  );
  const page = Math.max(parseInt(searchParams.get("page") ?? "1"), 1);
  const offset = (page - 1) * pageSize;

  const rows = await query<Categoria & { total: number }>(
    `SELECT c.id, c.parent_id, p.nome AS parent_nome,
            ARRAY(
              SELECT d.nome FROM cadegoria_departamento cd
              JOIN departamentos d ON d.id = cd.departamento_id
              WHERE cd.categoria_id = c.id
            ) AS departamentos_nomes,
            c.nome, c.descricao,
            c.sla_primeira_resp::text AS sla_primeira_resp,
            c.sla_resolucao::text AS sla_resolucao,
            c.visivel_cliente, c.ativo, c.ordem, c.criado_em,
            COUNT(*) OVER() AS total
     FROM categorias c
     LEFT JOIN categorias p ON p.id = c.parent_id
     WHERE ($1 = '' OR c.nome ILIKE '%' || $1 || '%')
       AND ($4 = '' OR EXISTS (
             SELECT 1 FROM cadegoria_departamento cd
             WHERE cd.categoria_id = c.id AND cd.departamento_id::text = $4
           ))
       AND ($5 = '' OR c.visivel_cliente = ($5 = 'true'))
     ORDER BY c.ordem, c.nome
     LIMIT $2 OFFSET $3`,
    [q, pageSize, offset, departamentoId, visivelCliente],
  );

  const total = rows[0]?.total ?? 0;
  return NextResponse.json(
    {
      data: rows,
      total: Number(total),
      page,
      pageSize,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=300",
      },
    },
  );
}

const createSchema = z.object({
  nome: z.string().min(2).max(100),
  descricao: z.string().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  sla_primeira_resp: z.string().nullable().optional(),
  sla_resolucao: z.string().nullable().optional(),
  visivel_cliente: z.boolean().optional(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().optional(),
});

// POST /api/categorias
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const {
    nome,
    descricao,
    parent_id,
    sla_primeira_resp,
    sla_resolucao,
    visivel_cliente,
    ativo,
    ordem,
  } = parsed.data;

  // Verificar nome duplicado no mesmo nível
  const existe = await query(
    `SELECT id FROM categorias WHERE nome = $1 AND (parent_id IS NOT DISTINCT FROM $2) LIMIT 1`,
    [nome, parent_id ?? null],
  );
  if (existe.length > 0) {
    return NextResponse.json(
      { error: "Já existe uma categoria com este nome neste nível" },
      { status: 409 },
    );
  }

  try {
    const [cat] = await query<Categoria>(
      `INSERT INTO categorias (parent_id, nome, descricao, sla_primeira_resp, sla_resolucao, visivel_cliente, ativo, ordem)
       VALUES ($1, $2, $3, $4::interval, $5::interval, $6, $7, $8)
       RETURNING id, parent_id, nome, descricao,
                 sla_primeira_resp::text AS sla_primeira_resp,
                 sla_resolucao::text AS sla_resolucao,
                 visivel_cliente, ativo, ordem, criado_em`,
      [
        parent_id ?? null,
        nome,
        descricao ?? null,
        sla_primeira_resp || null,
        sla_resolucao || null,
        visivel_cliente ?? true,
        ativo ?? true,
        ordem ?? 0,
      ],
    );
    return NextResponse.json(cat, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Valor de SLA inválido. Use formato como "2 hours", "1 day".' },
      { status: 400 },
    );
  }
}
