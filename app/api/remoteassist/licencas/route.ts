import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sanitizeText } from "@/lib/sanitize-text";
import type { RemoteAssistLicenca } from "@/types";

const criarSchema = z.object({
  device_id: z.string().trim().regex(/^\d{9}$/, "ID deve ter 9 dígitos"),
  nome_cliente: z.string().min(2).max(150).optional().nullable(),
  vencimento: z.string().date().optional().nullable(),
  obs: z.string().max(2000).optional().nullable(),
});

// GET /api/remoteassist/licencas
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const busca = req.nextUrl.searchParams.get("q") ?? "";

    const rows = await query<RemoteAssistLicenca>(
      `SELECT id, device_id, nome_cliente, status, vencimento::text AS vencimento, obs, ultimo_contato_em, criado_em, atualizado_em
       FROM remoteassist_licencas
       WHERE ($1 = '' OR nome_cliente ILIKE $1 OR device_id ILIKE $1)
       ORDER BY criado_em DESC`,
      [busca ? `%${busca}%` : ""],
    );

    return NextResponse.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error("[GET /api/remoteassist/licencas]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/remoteassist/licencas — cadastro manual (opcional; o relay também cria "pendente" sozinho)
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

    const { device_id, vencimento, obs } = parsed.data;
    const nome_cliente = parsed.data.nome_cliente ? sanitizeText(parsed.data.nome_cliente) : null;

    const existente = await queryOne(`SELECT id FROM remoteassist_licencas WHERE device_id = $1`, [device_id]);
    if (existente) {
      return NextResponse.json({ error: "Já existe uma licença com este ID" }, { status: 409 });
    }

    const licenca = await queryOne<RemoteAssistLicenca>(
      `INSERT INTO remoteassist_licencas (device_id, nome_cliente, vencimento, obs)
       VALUES ($1, $2, $3, $4)
       RETURNING id, device_id, nome_cliente, status, vencimento::text AS vencimento, obs, ultimo_contato_em, criado_em, atualizado_em`,
      [device_id, nome_cliente, vencimento || null, obs ? sanitizeText(obs) : null],
    );

    return NextResponse.json(licenca, { status: 201 });
  } catch (err) {
    console.error("[POST /api/remoteassist/licencas]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
