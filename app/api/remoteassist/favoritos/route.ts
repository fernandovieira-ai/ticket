// Sincronização dos favoritos (ID + senha salvos) do Remote Assist DRF entre
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
  device_id: string;
  senha: string | null;
  apelido: string | null;
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
      `SELECT id, device_id, senha, apelido, seq::text AS seq, removido, criado_em, atualizado_em
       FROM remoteassist_favoritos
       WHERE seq > $1
       ORDER BY seq ASC
       LIMIT $2`,
      [since, limit],
    );

    const hasMore = rows.length === limit;
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].seq : String(since);

    return NextResponse.json({ items: rows, nextCursor, hasMore });
  } catch (err) {
    console.error("[GET /api/remoteassist/favoritos]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

const putSchema = z.object({
  device_id: z.string().trim().regex(/^\d{9}$/, "ID deve ter 9 dígitos"),
  senha: z.string().max(500).nullable().optional(),
  apelido: z.string().trim().max(200).nullable().optional(),
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
  const { device_id, senha, apelido, removido } = parsed.data;

  try {
    const row = await queryOne<Row>(
      `INSERT INTO remoteassist_favoritos (device_id, senha, apelido, removido, seq)
       VALUES ($1, $2, $3, $4, nextval('remoteassist_favoritos_seq'))
       ON CONFLICT (device_id) DO UPDATE SET
         senha = EXCLUDED.senha,
         apelido = EXCLUDED.apelido,
         removido = EXCLUDED.removido,
         seq = nextval('remoteassist_favoritos_seq'),
         atualizado_em = NOW()
       RETURNING id, device_id, senha, apelido, seq::text AS seq, removido, criado_em, atualizado_em`,
      [device_id, senha ?? null, apelido ?? null, removido],
    );

    return NextResponse.json(row);
  } catch (err) {
    console.error("[PUT /api/remoteassist/favoritos]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
