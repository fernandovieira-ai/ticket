import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getEvolutionConfig } from "@/lib/whatsapp";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const rows = await query<Record<string, unknown>>(
    `SELECT id, nome_instancia, numero, provider, status, ativo, criado_em
     FROM whatsapp_instancias
     WHERE empresa_id = $1
     ORDER BY criado_em ASC`,
    [session.empresaId]
  );

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { nome_instancia, provider = "evolution" } = await req.json();
  if (!nome_instancia?.trim())
    return NextResponse.json({ error: "Nome da instância é obrigatório" }, { status: 400 });

  // Verify unique name within empresa
  const exists = await query(
    `SELECT id FROM whatsapp_instancias WHERE empresa_id = $1 AND nome_instancia = $2`,
    [session.empresaId, nome_instancia.trim()]
  );
  if (exists.length > 0)
    return NextResponse.json({ error: "Já existe uma instância com esse nome" }, { status: 409 });

  // Create instance in Evolution API if configured (best-effort — may already exist)
  const evo = await getEvolutionConfig(session.empresaId);
  if (evo) {
    try {
      await fetch(`${evo.url}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evo.key,
        },
        body: JSON.stringify({
          instanceName: nome_instancia.trim(),
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          groupsIgnore: false,
        }),
      });
      // Ignora erro da API (instância pode já existir lá)
    } catch {
      // Ignora falha de conexão — instância será registrada no banco mesmo assim
    }
  }

  const [row] = await query<{ id: string }>(
    `INSERT INTO whatsapp_instancias (empresa_id, nome_instancia, provider)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [session.empresaId, nome_instancia.trim(), provider]
  );

  return NextResponse.json({ id: row.id }, { status: 201 });
}
