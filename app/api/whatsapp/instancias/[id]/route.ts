import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getEvolutionConfig } from "@/lib/whatsapp";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const row = await queryOne<Record<string, unknown>>(
    `SELECT id, nome_instancia, numero, provider, status, qr_code, ativo, criado_em
     FROM whatsapp_instancias
     WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json(row);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const row = await queryOne<{ nome_instancia: string }>(
    `SELECT nome_instancia FROM whatsapp_instancias WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Delete from Evolution API if configured
  const evo = await getEvolutionConfig(session.empresaId);
  if (evo) {
    try {
      await fetch(`${evo.url}/instance/delete/${encodeURIComponent(row.nome_instancia)}`, {
        method: "DELETE",
        headers: { apikey: evo.key },
      });
    } catch {
      // Ignore errors from Evolution API (may not exist there)
    }
  }

  await query(
    `DELETE FROM whatsapp_instancias WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );

  return NextResponse.json({ ok: true });
}
