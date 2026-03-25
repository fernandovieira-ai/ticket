import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Empresa } from "@/types";

const criarEmpresaSchema = z.object({
  nome: z.string().min(2).max(200),
  dominio: z.string().max(100).nullable().optional(),
  logo_url: z.string().max(2000).nullable().optional(),
  fuso_horario: z.string().max(50).optional(),
  idioma: z.string().max(10).optional(),
  prefixo_ticket: z.string().min(1).max(10).optional(),
});

// GET /api/empresas
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin")
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { searchParams } = req.nextUrl;
    const busca = searchParams.get("q") ?? "";

    const empresas = await query<Empresa>(
      `SELECT * FROM empresas
       WHERE ($1 = '' OR nome ILIKE $1 OR dominio ILIKE $1)
       ORDER BY nome`,
      [busca ? `%${busca}%` : ""],
    );

    const total = empresas.length;
    return NextResponse.json({ data: empresas, total });
  } catch (err) {
    console.error("[GET /api/empresas]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/empresas
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin")
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const parsed = criarEmpresaSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Dados inválidos", detalhes: parsed.error.flatten() },
        { status: 400 },
      );

    const { nome, dominio, logo_url, fuso_horario, idioma, prefixo_ticket } =
      parsed.data;

    const empresa = await queryOne<Empresa>(
      `INSERT INTO empresas (nome, dominio, logo_url, fuso_horario, idioma, prefixo_ticket)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        nome,
        dominio ?? null,
        logo_url ?? null,
        fuso_horario ?? "America/Sao_Paulo",
        idioma ?? "pt-BR",
        prefixo_ticket ?? "TK",
      ],
    );

    return NextResponse.json(empresa, { status: 201 });
  } catch (err) {
    console.error("[POST /api/empresas]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
