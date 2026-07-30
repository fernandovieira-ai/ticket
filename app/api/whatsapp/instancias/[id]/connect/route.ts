import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getEvolutionConfig, generateWPPToken } from "@/lib/whatsapp";

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

  const wpp = await getEvolutionConfig(session.empresaId);
  if (!wpp) {
    return NextResponse.json(
      { error: "WPPConnect não configurado. Acesse Configurações > WhatsApp > API para configurar." },
      { status: 503 }
    );
  }

  try {
    // 1. Gerar token temporário usando SECRET_KEY
    const token = await generateWPPToken(wpp.url, wpp.key, row.nome_instancia);
    if (!token) {
      return NextResponse.json(
        { error: "Não foi possível gerar token de autenticação" },
        { status: 502 }
      );
    }

    // 2. Verificar status atual da sessão
    const statusRes = await fetch(`${wpp.url}/api/${encodeURIComponent(row.nome_instancia)}/status-session`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });

    let needsStart = false;

    if (statusRes.ok) {
      const statusData = await statusRes.json();
      // Se está CLOSED ou não tem QR code, precisa iniciar sessão
      if (statusData.status === "CLOSED" || !statusData.qrcode) {
        needsStart = true;
      }
    } else {
      // Se deu erro (sessão não existe), precisa criar
      needsStart = true;
    }

    // 3. Se necessário, iniciar a sessão
    if (needsStart) {
      await fetch(`${wpp.url}/api/${encodeURIComponent(row.nome_instancia)}/start-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          webhook: "",
          waitQrCode: true,
        }),
      });

      // Aguardar 2 segundos para sessão inicializar
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 4. Buscar QR Code atualizado
    const res = await fetch(`${wpp.url}/api/${encodeURIComponent(row.nome_instancia)}/status-session`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `WPPConnect: ${err.message ?? res.statusText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    // WPPConnect retorna data.qrcode com o QR code em base64
    const qrCode = data.qrcode ?? null;

    if (qrCode) {
      await query(
        `UPDATE whatsapp_instancias SET qr_code = $1, status = 'aguardando_qr' WHERE id = $2`,
        [qrCode, id]
      );
    }

    return NextResponse.json({ qr_code: qrCode, status: "aguardando_qr" });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível conectar ao WPPConnect" },
      { status: 502 }
    );
  }
}
