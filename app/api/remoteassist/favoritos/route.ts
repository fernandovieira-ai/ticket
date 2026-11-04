// Sincronização dos favoritos (ID + senha salvos) do Remote Assist DRF entre
// máquinas do mesmo usuário. Chamado pelo app (edição completa), não pelo relay.
// Não usa sessão de usuário: autentica por segredo compartilhado.
// Header: x-relay-secret=<REMOTEASSIST_RELAY_SECRET>
// Contrato (shape da resposta, tipos, limites) definido em SPEC-FAVORITOS-COMPARTILHADOS.md
// (projeto remotodrf) — mantido em sincronia com o cliente C#.
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface Row {
  device_id: string;
  senha: string | null;
  apelido: string | null;
  grupo: string | null;
  seq: string;
  removido: boolean;
}

function serialize(row: Row) {
  return {
    device_id: row.device_id,
    senha: row.senha,
    apelido: row.apelido,
    grupo: row.grupo,
    seq: Number(row.seq),
    removido: row.removido,
  };
}

function authorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-relay-secret");
  return !!secret && !!process.env.REMOTEASSIST_RELAY_SECRET && secret === process.env.REMOTEASSIST_RELAY_SECRET;
}

function unauthorized() {
  return NextResponse.json({ error: "não autorizado" }, { status: 401 });
}

/** GET /api/remoteassist/favoritos?since=<seq>&limit=<n> — página de mudanças desde o cursor. */
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
    // Pede um a mais do que o limite só pra saber se existe próxima página, sem contar linhas à parte.
    const rows = await query<Row>(
      `SELECT device_id, senha, apelido, grupo, seq::text AS seq, removido
       FROM remoteassist_favoritos
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
    console.error("[GET /api/remoteassist/favoritos]", err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}

/** PUT /api/remoteassist/favoritos — upsert por device_id, sempre gera um seq novo. */
export async function PUT(req: NextRequest) {
  if (!authorized(req)) return unauthorized();

  let body: { device_id?: unknown; senha?: unknown; apelido?: unknown; grupo?: unknown; removido?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  if (!/^\d{9}$/.test(deviceId)) {
    return NextResponse.json({ error: "device_id precisa ter exatamente 9 dígitos" }, { status: 400 });
  }

  const senha = typeof body.senha === "string" && body.senha.length > 0 ? body.senha : null;
  const apelido = typeof body.apelido === "string" && body.apelido.length > 0 ? body.apelido.slice(0, 200) : null;
  const grupo = typeof body.grupo === "string" && body.grupo.length > 0 ? body.grupo.slice(0, 200) : null;
  const removido = body.removido === true;

  try {
    // ON CONFLICT faz o upsert atômico: mesmo com vários técnicos salvando ao mesmo tempo, não há
    // condição de corrida entre o insert e o update, e o seq novo sempre vem de nextval() (atômico).
    const row = await queryOne<Row>(
      `INSERT INTO remoteassist_favoritos (device_id, senha, apelido, grupo, seq, removido)
       VALUES ($1, $2, $3, $4, nextval('remoteassist_favoritos_seq'), $5)
       ON CONFLICT (device_id) DO UPDATE SET
         senha = EXCLUDED.senha,
         apelido = EXCLUDED.apelido,
         grupo = EXCLUDED.grupo,
         removido = EXCLUDED.removido,
         seq = nextval('remoteassist_favoritos_seq'),
         atualizado_em = NOW()
       RETURNING device_id, senha, apelido, grupo, seq::text AS seq, removido`,
      [deviceId, senha, apelido, grupo, removido],
    );

    return NextResponse.json(serialize(row!));
  } catch (err) {
    console.error("[PUT /api/remoteassist/favoritos]", err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
