import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getEvolutionConfig, generateWPPToken } from "@/lib/whatsapp";

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

  const wpp = await getEvolutionConfig(session.empresaId);

  if (!wpp) {
    return NextResponse.json({ status: row.status, numero: row.numero });
  }

  try {
    // Gerar token temporário usando SECRET_KEY
    const token = await generateWPPToken(wpp.url, wpp.key, row.nome_instancia);
    if (!token) {
      return NextResponse.json({ status: row.status, numero: row.numero });
    }

    const res = await fetch(
      `${wpp.url}/api/${encodeURIComponent(row.nome_instancia)}/status-session`,
      {
        headers: { "Authorization": `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!res.ok) {
      return NextResponse.json({ status: row.status, numero: row.numero });
    }

    const data = await res.json();
    // WPPConnect returns: { status: "CONNECTED" | "QRCODE" | "CLOSED" }
    const state = data.status ?? null;

    // Map WPPConnect states to our status values
    const statusMap: Record<string, string> = {
      CONNECTED: "conectado",
      QRCODE: "aguardando_qr",
      CLOSED: "desconectado",
      INITIALIZING: "conectando",
    };
    const novoStatus = statusMap[state] ?? row.status;

    if (novoStatus !== row.status) {
      await query(
        `UPDATE whatsapp_instancias SET status = $1 WHERE id = $2`,
        [novoStatus, id]
      );
    }

    // WPPConnect: o número pode vir no campo wid ou phone
    const numero = row.numero;

    return NextResponse.json({ status: novoStatus, numero });
  } catch {
    return NextResponse.json({ status: row.status, numero: row.numero });
  }
}
