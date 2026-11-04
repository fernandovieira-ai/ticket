// Registro compartilhado dos nomes de grupo dos favoritos do Remote Assist DRF (separado de qual
// grupo cada favorito está, que fica na coluna "grupo" de remoteassist_favoritos — ver route.ts em
// favoritos/). Existir aqui é o que deixa um grupo aparecer pronto no menu de todo mundo mesmo antes
// de qualquer favorito ser colocado nele.
// Header: x-relay-secret=<REMOTEASSIST_RELAY_SECRET>
// Contrato definido em SPEC-FAVORITOS-COMPARTILHADOS.md (projeto remotodrf).
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface Row {
  nome: string;
  seq: string;
  removido: boolean;
}

function serialize(row: Row) {
  return { nome: row.nome, seq: Number(row.seq), removido: row.removido };
}

function authorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-relay-secret");
  return !!secret && !!process.env.REMOTEASSIST_RELAY_SECRET && secret === process.env.REMOTEASSIST_RELAY_SECRET;
}

function unauthorized() {
  return NextResponse.json({ error: "não autorizado" }, { status: 401 });
}

/** GET /api/remoteassist/favoritos/grupos?since=<seq>&limit=<n> — página de mudanças desde o cursor. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();

  const { searchParams } = req.nextUrl;
  const since = Number(searchParams.get("since") ?? "0");
  const limitParam = Number(searchParams.get("limit") ?? String(DEFAULT_LIMIT));

  if (!Number.isFinite(since) || since < 0) {
    return NextResponse.json({ error: "since inválido" }, { status: 400 });
  }

  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? Math.trunc(limitParam) : DEFAULT_LIMIT, 1), MAX_LIMIT);

  try {
    const rows = await query<Row>(
      `SELECT nome, seq::text AS seq, removido
       FROM remoteassist_favoritos_grupos
       WHERE seq > $1
       ORDER BY seq ASC
       LIMIT $2`,
      [since, limit + 1],
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = page.length > 0 ? Number(page[page.length - 1].seq) : since;

    return NextResponse.json({ items: page.map(serialize), nextCursor, hasMore });
  } catch (err) {
    console.error("[GET /api/remoteassist/favoritos/grupos]", err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}

/** PUT /api/remoteassist/favoritos/grupos — upsert por nome, sempre gera um seq novo. */
export async function PUT(req: NextRequest) {
  if (!authorized(req)) return unauthorized();

  let body: { nome?: unknown; removido?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim().slice(0, 200) : "";
  if (nome.length === 0) {
    return NextResponse.json({ error: "nome não pode ser vazio" }, { status: 400 });
  }

  const removido = body.removido === true;

  try {
    const row = await queryOne<Row>(
      `INSERT INTO remoteassist_favoritos_grupos (nome, seq, removido)
       VALUES ($1, nextval('remoteassist_favoritos_grupos_seq'), $2)
       ON CONFLICT (nome) DO UPDATE SET
         removido = EXCLUDED.removido,
         seq = nextval('remoteassist_favoritos_grupos_seq'),
         atualizado_em = NOW()
       RETURNING nome, seq::text AS seq, removido`,
      [nome, removido],
    );

    return NextResponse.json(serialize(row!));
  } catch (err) {
    console.error("[PUT /api/remoteassist/favoritos/grupos]", err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
