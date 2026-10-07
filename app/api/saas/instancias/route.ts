import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sanitizeText } from "@/lib/sanitize-text";
import type { SaasInstancia } from "@/types";

const criarSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
  database_name: z.string().min(2).max(63).regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underscore"),
  nome_cliente: z.string().min(2).max(150),
  dominio: z.string().max(255).optional().nullable(),
  plano: z.string().max(20).optional(),
  obs: z.string().max(2000).optional().nullable(),
});

// GET /api/saas/instancias
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const busca = req.nextUrl.searchParams.get("q") ?? "";

    const rows = await query<SaasInstancia>(
      `SELECT id, slug, database_name, nome_cliente, dominio, plano, status,
              token_api, obs, criado_em, atualizado_em
       FROM saas_instancias
       WHERE ($1 = '' OR nome_cliente ILIKE $1 OR slug ILIKE $1 OR database_name ILIKE $1)
       ORDER BY nome_cliente`,
      [busca ? `%${busca}%` : ""],
    );

    return NextResponse.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error("[GET /api/saas/instancias]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/saas/instancias
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const parsed = criarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 400 });
    }

    const { slug, database_name, dominio, plano, obs } = parsed.data;
    const nome_cliente = sanitizeText(parsed.data.nome_cliente);

    const existente = await queryOne(
      `SELECT id FROM saas_instancias WHERE slug = $1 OR database_name = $2`,
      [slug, database_name],
    );
    if (existente) {
      return NextResponse.json({ error: "Já existe uma instância com este slug ou database" }, { status: 409 });
    }

    const instancia = await queryOne<SaasInstancia>(
      `INSERT INTO saas_instancias (slug, database_name, nome_cliente, dominio, plano, obs)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'basico'), $6)
       RETURNING id, slug, database_name, nome_cliente, dominio, plano, status, token_api, obs, criado_em, atualizado_em`,
      [slug, database_name, nome_cliente, dominio || null, plano || null, obs ? sanitizeText(obs) : null],
    );

    return NextResponse.json(instancia, { status: 201 });
  } catch (err) {
    console.error("[POST /api/saas/instancias]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
