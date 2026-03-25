import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getEvolutionConfig } from "@/lib/whatsapp";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const row = await queryOne<{ nome_instancia: string; status: string }>(
    `SELECT nome_instancia, status FROM whatsapp_instancias WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const evo = await getEvolutionConfig(session.empresaId);
  if (!evo) {
    return NextResponse.json(
      { error: "Evolution API não configurada. Acesse Configurações > WhatsApp > API para configurar." },
      { status: 503 }
    );
  }

  // Registra webhook URL na Evolution API (garantia antes de conectar)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  try {
    await fetch(`${evo.url}/webhook/set/${encodeURIComponent(row.nome_instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evo.key },
      body: JSON.stringify({
        enabled: true,
        url: `${appUrl}/api/whatsapp/webhook`,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      }),
    });
  } catch {
    // Ignora falha no registro do webhook — não impede conexão
  }

  try {
    const res = await fetch(`${evo.url}/instance/connect/${encodeURIComponent(row.nome_instancia)}`, {
      method: "GET",
      headers: { apikey: evo.key },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Evolution API: ${err.message ?? res.statusText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    // data.base64 contains the QR code image in base64
    // data.code contains the QR code text
    const qrCode = data.base64 ?? data.qrcode?.base64 ?? null;

    if (qrCode) {
      await query(
        `UPDATE whatsapp_instancias SET qr_code = $1, status = 'aguardando_qr' WHERE id = $2`,
        [qrCode, id]
      );
    }

    return NextResponse.json({ qr_code: qrCode, status: "aguardando_qr" });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível conectar ao Evolution API" },
      { status: 502 }
    );
  }
}
