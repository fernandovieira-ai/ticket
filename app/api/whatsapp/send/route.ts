import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getEvolutionConfig } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { ticket_id, numero, mensagem } = await req.json();

  if (!numero?.trim() || !mensagem?.trim()) {
    return NextResponse.json(
      { error: "Número e mensagem são obrigatórios" },
      { status: 400 }
    );
  }

  // Get active instance for this empresa
  const instancia = await queryOne<{ id: string; nome_instancia: string; status: string }>(
    `SELECT id, nome_instancia, status
     FROM whatsapp_instancias
     WHERE empresa_id = $1 AND ativo = TRUE AND status = 'conectado'
     ORDER BY criado_em ASC
     LIMIT 1`,
    [session.empresaId]
  );

  if (!instancia) {
    return NextResponse.json(
      { error: "Nenhuma instância do WhatsApp conectada. Configure em Configurações > WhatsApp." },
      { status: 503 }
    );
  }

  const evo = await getEvolutionConfig(session.empresaId);

  if (!evo) {
    return NextResponse.json(
      { error: "Evolution API não configurada. Acesse Configurações > WhatsApp > API." },
      { status: 503 }
    );
  }

  // Format number: remove non-digits, ensure country code
  const numeroLimpo = numero.replace(/\D/g, "");
  const jid = `${numeroLimpo}@s.whatsapp.net`;

  // Strip HTML tags from message (rich text to plain text)
  const textoPlano = mensagem.replace(/<[^>]*>/g, "").trim();

  try {
    const res = await fetch(
      `${evo.url}/message/sendText/${encodeURIComponent(instancia.nome_instancia)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evo.key,
        },
        body: JSON.stringify({
          number: jid,
          text: textoPlano,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Evolution API: ${err.message ?? res.statusText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const messageId = data.key?.id ?? data.id ?? null;

    // Find or create whatsapp_contato
    let contato = await queryOne<{ id: string }>(
      `SELECT id FROM whatsapp_contatos WHERE empresa_id = $1 AND numero = $2`,
      [session.empresaId, numeroLimpo]
    );
    if (!contato) {
      const [novo] = await query<{ id: string }>(
        `INSERT INTO whatsapp_contatos (empresa_id, numero) VALUES ($1, $2) RETURNING id`,
        [session.empresaId, numeroLimpo]
      );
      contato = novo;
    }

    // Record the sent message
    await query(
      `INSERT INTO whatsapp_mensagens
         (empresa_id, ticket_id, contato_id, message_id, direcao, tipo, corpo, status, agente_id)
       VALUES ($1, $2, $3, $4, 'saida', 'texto', $5, 'enviada', $6)`,
      [
        session.empresaId,
        ticket_id ?? null,
        contato.id,
        messageId,
        textoPlano,
        session.sub,
      ]
    );

    return NextResponse.json({ ok: true, message_id: messageId });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível conectar ao Evolution API" },
      { status: 502 }
    );
  }
}
