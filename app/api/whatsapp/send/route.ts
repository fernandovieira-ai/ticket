import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getEvolutionConfig, generateWPPToken, normalizarTelefone } from "@/lib/whatsapp";

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

  // Normaliza número e converte HTML em texto plano
  const numeroNormalizado = normalizarTelefone(numero);
  const textoPlano = mensagem.replace(/<[^>]*>/g, "").trim();

  // Gera token WPPConnect
  const token = await generateWPPToken(evo.url, evo.key, instancia.nome_instancia);
  if (!token) {
    return NextResponse.json(
      { error: "Não foi possível autenticar no WPPConnect. Verifique a configuração." },
      { status: 502 },
    );
  }

  try {
    const res = await fetch(
      `${evo.url}/api/${instancia.nome_instancia}/send-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: numeroNormalizado,
          message: textoPlano,
          isGroup: false,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `WPPConnect: ${err.message ?? res.statusText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const responseArray = data.response as Array<Record<string, unknown>> | undefined;
    const messageId = (responseArray?.[0]?.id as string) ?? null;

    // Find or create whatsapp_contato
    let contato = await queryOne<{ id: string }>(
      `SELECT id FROM whatsapp_contatos WHERE empresa_id = $1 AND numero = $2`,
      [session.empresaId, numeroNormalizado]
    );
    if (!contato) {
      const [novo] = await query<{ id: string }>(
        `INSERT INTO whatsapp_contatos (empresa_id, numero) VALUES ($1, $2) RETURNING id`,
        [session.empresaId, numeroNormalizado]
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
      { error: "Não foi possível conectar ao WPPConnect" },
      { status: 502 }
    );
  }
}
