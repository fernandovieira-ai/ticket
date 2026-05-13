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

  const row = await queryOne<{ nome_instancia: string; status: string; numero: string | null }>(
    `SELECT nome_instancia, status, numero FROM whatsapp_instancias WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const evo = await getEvolutionConfig(session.empresaId);

  if (!evo) {
    return NextResponse.json({ status: row.status, numero: row.numero });
  }

  try {
    const res = await fetch(
      `${evo.url}/instance/connectionState/${encodeURIComponent(row.nome_instancia)}`,
      { headers: { apikey: evo.key }, signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) {
      return NextResponse.json({ status: row.status, numero: row.numero });
    }

    const data = await res.json();
    // Evolution API returns: { instance: { instanceName, state } }
    const state = data.instance?.state ?? data.state ?? null;

    // Map Evolution states to our status values
    const statusMap: Record<string, string> = {
      open: "conectado",
      connecting: "conectando",
      close: "desconectado",
    };
    const novoStatus = statusMap[state] ?? row.status;

    if (novoStatus !== row.status) {
      await query(
        `UPDATE whatsapp_instancias SET status = $1 WHERE id = $2`,
        [novoStatus, id]
      );
    }

    // If connected, try to get the phone number
    let numero = row.numero;
    if (state === "open" && !numero) {
      try {
        const profileRes = await fetch(
          `${evo.url}/instance/fetchInstances`,
          { headers: { apikey: evo.key }, signal: AbortSignal.timeout(5000) }
        );
        if (profileRes.ok) {
          const instances = await profileRes.json();
          const inst = Array.isArray(instances)
            ? instances.find((i: Record<string, unknown>) => i.name === row.nome_instancia)
            : null;
          numero = inst?.ownerJid?.replace("@s.whatsapp.net", "") ?? null;
          if (numero) {
            await query(
              `UPDATE whatsapp_instancias SET numero = $1 WHERE id = $2`,
              [numero, id]
            );
          }
        }
      } catch {
        // Ignore
      }
    }

    return NextResponse.json({ status: novoStatus, numero });
  } catch {
    return NextResponse.json({ status: row.status, numero: row.numero });
  }
}
