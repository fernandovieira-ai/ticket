import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Departamento } from "@/types";
import { sanitizeText } from "@/lib/sanitize-text";

const criarSchema = z.object({
  nome: z.string().min(2).max(100),
  descricao: z.string().max(500).optional().nullable(),
});

// GET /api/departamentos
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const busca = searchParams.get("q") ?? "";
  const pagina = Math.max(1, Number(searchParams.get("page") ?? 1));
  const tamanho = Math.min(
    50,
    Math.max(5, Number(searchParams.get("pageSize") ?? 50)),
  );
  const offset = (pagina - 1) * tamanho;

  const rows = await query<Departamento & { total_count: number }>(
    `SELECT id, nome, descricao, ativo, criado_em,
            COUNT(*) OVER() AS total_count
     FROM departamentos
     WHERE empresa_id = $1
       AND ($2 = '' OR nome ILIKE $2 OR descricao ILIKE $2)
     ORDER BY nome
     LIMIT $3 OFFSET $4`,
    [session.empresaId, busca ? `%${busca}%` : "", tamanho, offset],
  );

  return NextResponse.json(
    {
      data: rows,
      total: rows[0]?.total_count ?? 0,
      page: pagina,
      pageSize: tamanho,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=300",
      },
    },
  );
}

// POST /api/departamentos
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

  const parsed = criarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { nome: nomeOriginal, descricao: descricaoOriginal } = parsed.data;

  // Sanitizar caracteres especiais para compatibilidade com LATIN1
  const nome = sanitizeText(nomeOriginal);
  const descricao = descricaoOriginal ? sanitizeText(descricaoOriginal) : null;

  const existente = await queryOne(
    `SELECT id FROM departamentos WHERE empresa_id = $1 AND nome ILIKE $2`,
    [session.empresaId, nome],
  );
  if (existente) {
    return NextResponse.json(
      { error: "Já existe um departamento com este nome" },
      { status: 409 },
    );
  }

  const [departamento] = await query<Departamento>(
    `INSERT INTO departamentos (empresa_id, nome, descricao)
     VALUES ($1, $2, $3)
     RETURNING id, nome, descricao, ativo, criado_em`,
    [session.empresaId, nome, descricao],
  );

  return NextResponse.json(departamento, { status: 201 });
}
