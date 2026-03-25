import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

// Ensures the extra columns exist in whatsapp_config (self-migration)
async function garantirColunas() {
  await query(`
    ALTER TABLE whatsapp_config
      ADD COLUMN IF NOT EXISTS evolution_api_url  TEXT,
      ADD COLUMN IF NOT EXISTS evolution_api_key  TEXT,
      ADD COLUMN IF NOT EXISTS evolution_instance VARCHAR(100)
  `);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  await garantirColunas();

  const row = await queryOne<{
    evolution_api_url: string | null;
    evolution_api_key: string | null;
    evolution_instance: string | null;
  }>(
    `SELECT evolution_api_url, evolution_api_key, evolution_instance
     FROM whatsapp_config WHERE empresa_id = $1`,
    [session.empresaId]
  );

  // Fallback to env vars if not saved in DB yet
  const url = row?.evolution_api_url ?? process.env.EVOLUTION_API_URL ?? "";
  const key = row?.evolution_api_key ?? process.env.EVOLUTION_API_KEY ?? "";
  const instance = row?.evolution_instance ?? process.env.EVOLUTION_INSTANCE ?? "";

  return NextResponse.json({
    evolution_api_url: url,
    // Mask key: show only last 6 chars
    evolution_api_key: key ? `${"*".repeat(Math.max(0, key.length - 6))}${key.slice(-6)}` : "",
    evolution_api_key_set: key.length > 0,
    evolution_instance: instance,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await garantirColunas();

  const { evolution_api_url, evolution_api_key, evolution_instance } = await req.json();

  // If key is all asterisks (masked), don't overwrite the existing key
  const isMasked = /^\*+.{0,6}$/.test(evolution_api_key ?? "");

  await query(
    `INSERT INTO whatsapp_config (empresa_id, evolution_api_url, evolution_api_key, evolution_instance)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (empresa_id) DO UPDATE SET
       evolution_api_url  = EXCLUDED.evolution_api_url,
       evolution_api_key  = CASE WHEN $5 THEN whatsapp_config.evolution_api_key ELSE EXCLUDED.evolution_api_key END,
       evolution_instance = EXCLUDED.evolution_instance`,
    [
      session.empresaId,
      evolution_api_url?.trim() || null,
      evolution_api_key?.trim() || null,
      evolution_instance?.trim() || null,
      isMasked,
    ]
  );

  return NextResponse.json({ ok: true });
}
