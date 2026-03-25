import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getEvolutionConfig } from "@/lib/whatsapp";

type Params = { params: Promise<{ id: string }> };

// POST /api/whatsapp/instancias/[id]/settings
// Aplica configurações na Evolution API para a instância (groupsIgnore, etc.)
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const inst = await queryOne<{ nome_instancia: string }>(
    `SELECT nome_instancia FROM whatsapp_instancias WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!inst) return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });

  const evo = await getEvolutionConfig(session.empresaId);
  if (!evo) return NextResponse.json({ error: "Evolution API não configurada" }, { status: 422 });

  const resp = await fetch(
    `${evo.url}/settings/set/${encodeURIComponent(inst.nome_instancia)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evo.key },
      body: JSON.stringify({
        rejectCall: false,
        groupsIgnore: false,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      }),
    }
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return NextResponse.json({ error: "Falha na Evolution API", detail: data }, { status: 502 });
  }

  return NextResponse.json({ ok: true, settings: data });
}
