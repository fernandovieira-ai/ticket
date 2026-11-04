// Sincronização dos grupos de favoritos do Remote Assist DRF entre
// máquinas do mesmo usuário. Chamado pelo app (edição completa), não pelo relay.
// Não usa sessão de usuário: autentica por segredo compartilhado.
// Header: x-relay-secret=<REMOTEASSIST_RELAY_SECRET>
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

interface Row {
  id: string;
  nome: string;
  seq: string;
  removido: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

function authorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-relay-secret");
  return !!secret && !!process.env.REMOTEASSIST_RELAY_SECRET && secret === process.env.REMOTEASSIST_RELAY_SECRET;
}

const querySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    since: req.nextUrl.searchParams.get("since") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }
  const { since, limit } = parsed.data;

  try {
    const rows = await query<Row>(
      `SELECT id, nome, seq::text AS seq, removido, criado_em, atualizado_em
       FROM remoteassist_favoritos_grupos
       WHERE seq > $1
       ORDER BY seq ASC
       LIMIT $2`,
      [since, limit],
    );

    const hasMore = rows.length === limit;
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].seq : String(since);

    return NextResponse.json({ items: rows, nextCursor, hasMore });
  } catch (err) {
    console.error("[GET /api/remoteassist/favoritos/grupos]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

const putSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  removido: z.boolean().optional().default(false),
});

export async function PUT(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 400 });
  }
  const { nome, removido } = parsed.data;

  try {
    const row = await queryOne<Row>(
      `INSERT INTO remoteassist_favoritos_grupos (nome, removido, seq)
       VALUES ($1, $2, nextval('remoteassist_favoritos_grupos_seq'))
       ON CONFLICT (nome) DO UPDATE SET
         removido = EXCLUDED.removido,
         seq = nextval('remoteassist_favoritos_grupos_seq'),
         atualizado_em = NOW()
       RETURNING id, nome, seq::text AS seq, removido, criado_em, atualizado_em`,
      [nome, removido],
    );

    return NextResponse.json(row);
  } catch (err) {
    console.error("[PUT /api/remoteassist/favoritos/grupos]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
