import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, transaction } from "@/lib/db";
import type { PoolClient } from "pg";

// Remove characters that cannot be represented in LATIN1 (code point > 255).
// Necessary because the PostgreSQL instance uses LATIN1 encoding.
function san(value: string | null | undefined): string | null {
  if (value == null) return null;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[^\x00-\xFF]/g, "");
}

// Evolution API sends webhook events to this endpoint
// Configure in Evolution API: webhookUrl = https://yourdomain.com/api/whatsapp/webhook
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, instance, data } = body;

    if (!event || !instance) {
      return NextResponse.json({ ok: true });
    }

    // Find the instancia record
    const instancia = await queryOne<{
      id: string;
      empresa_id: string;
      status: string;
    }>(
      `SELECT id, empresa_id, status FROM whatsapp_instancias WHERE nome_instancia = $1`,
      [instance],
    );
    if (!instancia) return NextResponse.json({ ok: true });

    // Handle connection state changes
    if (event === "connection.update") {
      const state = data?.state;
      const statusMap: Record<string, string> = {
        open: "conectado",
        connecting: "conectando",
        close: "desconectado",
      };
      const novoStatus = statusMap[state] ?? instancia.status;
      if (novoStatus !== instancia.status) {
        await query(
          `UPDATE whatsapp_instancias SET status = $1, qr_code = NULL WHERE id = $2`,
          [novoStatus, instancia.id],
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Handle QR code update
    if (event === "qrcode.updated") {
      const qrCode = data?.qrcode?.base64 ?? data?.base64 ?? null;
      if (qrCode) {
        await query(
          `UPDATE whatsapp_instancias SET qr_code = $1, status = 'aguardando_qr' WHERE id = $2`,
          [qrCode, instancia.id],
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Handle incoming messages
    if (event === "messages.upsert") {
      const messages = Array.isArray(data?.messages) ? data.messages : [data];
      for (const msg of messages) {
        const remoteJid = (msg as Record<string, unknown>)?.key
          ? (((msg as Record<string, unknown>).key as Record<string, unknown>)
              ?.remoteJid as string)
          : null;

        if (remoteJid?.endsWith("@g.us")) {
          await processarMensagemGrupo(
            instancia,
            msg as Record<string, unknown>,
          );
        } else {
          await processarMensagemEntrada(instancia, msg);
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook whatsapp]", err);
    return NextResponse.json({ ok: true }); // Always return 200 to avoid Evolution retries
  }
}

async function processarMensagemEntrada(
  instancia: { id: string; empresa_id: string },
  msg: Record<string, unknown>,
) {
  // Evolution message structure
  const key = msg.key as Record<string, unknown> | undefined;
  if (!key || key.fromMe) return; // Ignore messages sent by us

  const messageId = key.id as string;
  const remoteJid = key.remoteJid as string;
  if (!remoteJid || remoteJid.endsWith("@g.us")) return; // Groups are handled by processarMensagemGrupo

  const numero = remoteJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
  const pushName = san((msg.pushName as string) ?? null);

  const message = msg.message as Record<string, unknown> | undefined;
  const textoRaw =
    (message?.conversation as string) ??
    ((message?.extendedTextMessage as Record<string, unknown>)
      ?.text as string) ??
    null;
  const texto = san(textoRaw);

  if (!texto) return; // Only handle text messages for now

  // Find or create contato
  let contato = await queryOne<{ id: string; usuario_id: string | null }>(
    `SELECT id, usuario_id FROM whatsapp_contatos WHERE empresa_id = $1 AND numero = $2`,
    [instancia.empresa_id, numero],
  );

  if (!contato) {
    const [novo] = await query<{ id: string; usuario_id: string | null }>(
      `INSERT INTO whatsapp_contatos (empresa_id, numero, nome) VALUES ($1, $2, $3) RETURNING id, usuario_id`,
      [instancia.empresa_id, numero, pushName],
    );
    contato = novo;
  } else if (pushName && !contato.usuario_id) {
    await query(`UPDATE whatsapp_contatos SET nome = $1 WHERE id = $2`, [
      pushName,
      contato.id,
    ]);
  }

  // Resolve cliente_id via usuario_clientes (tabela N:N entre usuarios e clientes)
  const clienteVinculado = contato.usuario_id
    ? await queryOne<{ cliente_id: string }>(
        `SELECT uc.cliente_id
         FROM usuario_clientes uc
         JOIN clientes c ON c.id = uc.cliente_id
         WHERE uc.usuario_id = $1 AND c.empresa_id = $2
         LIMIT 1`,
        [contato.usuario_id, instancia.empresa_id],
      )
    : null;
  const clienteId = clienteVinculado?.cliente_id ?? null;

  // Avoid duplicate processing
  const existing = await queryOne(
    `SELECT id FROM whatsapp_mensagens WHERE message_id = $1 AND empresa_id = $2`,
    [messageId, instancia.empresa_id],
  );
  if (existing) return;

  // Get whatsapp_config to check if auto-ticket creation is enabled
  const config = await queryOne<{
    criar_ticket_auto: boolean;
    categoria_padrao_id: string | null;
    msg_ticket_criado: string;
  }>(
    `SELECT criar_ticket_auto, categoria_padrao_id, msg_ticket_criado
     FROM whatsapp_config WHERE empresa_id = $1`,
    [instancia.empresa_id],
  );

  // Find open ticket for this contact to add message to, or create new one
  let ticketId: string | null = null;

  const ticketAberto = await queryOne<{ id: string; numero: string }>(
    `SELECT t.id, t.numero
     FROM tickets t
     WHERE t.empresa_id = $1
       AND t.canal = 'whatsapp'
       AND t.cliente_id = $2
       AND EXISTS (
         SELECT 1 FROM ticket_status ts
         WHERE ts.id = t.status_id AND ts.encerra = FALSE
       )
     ORDER BY t.criado_em DESC
     LIMIT 1`,
    [instancia.empresa_id, clienteId],
  );

  if (ticketAberto) {
    ticketId = ticketAberto.id;
    // Add message to existing ticket
    await query(
      `INSERT INTO mensagens (ticket_id, empresa_id, corpo, interna, autor_id)
       SELECT $1, $2, $3, FALSE, u.id
       FROM usuarios u
       WHERE u.empresa_id = $2 AND u.perfil = 'admin'
       LIMIT 1`,
      [ticketId, instancia.empresa_id, texto],
    );
  } else if (config?.criar_ticket_auto) {
    // Create new ticket automatically
    const statusAberto = await queryOne<{ id: string }>(
      `SELECT id FROM ticket_status WHERE empresa_id = $1 AND codigo = 'aberto' LIMIT 1`,
      [instancia.empresa_id],
    );
    const prioridadeNormal = await queryOne<{ id: string }>(
      `SELECT id FROM ticket_prioridades WHERE empresa_id = $1 AND codigo = 'normal' LIMIT 1`,
      [instancia.empresa_id],
    );

    if (statusAberto && prioridadeNormal) {
      const count = await queryOne<{ c: string }>(
        `SELECT COUNT(*) AS c FROM tickets WHERE empresa_id = $1`,
        [instancia.empresa_id],
      );
      const numero_ticket = `#${String(Number(count?.c ?? 0) + 1).padStart(5, "0")}`;

      const [novoTicket] = await query<{ id: string; numero: string }>(
        `INSERT INTO tickets
           (empresa_id, numero, titulo, descricao, canal, status_id, prioridade_id,
            cliente_id, aberto_por, categoria_id)
         SELECT $1, $2, $3, $4, 'whatsapp', $5, $6, $7,
                u.id, $8
         FROM usuarios u
         WHERE u.empresa_id = $1 AND u.perfil = 'admin'
         LIMIT 1
         RETURNING id, numero`,
        [
          instancia.empresa_id,
          numero_ticket,
          texto.substring(0, 100),
          texto,
          statusAberto.id,
          prioridadeNormal.id,
          clienteId,
          config.categoria_padrao_id ?? null,
        ],
      );

      if (novoTicket) {
        ticketId = novoTicket.id;
        // Initial message
        await query(
          `INSERT INTO mensagens (ticket_id, empresa_id, corpo, interna)
           VALUES ($1, $2, $3, FALSE)`,
          [ticketId, instancia.empresa_id, texto],
        );
      }
    }
  }

  // Record in whatsapp_mensagens
  await query(
    `INSERT INTO whatsapp_mensagens
       (empresa_id, ticket_id, contato_id, message_id, direcao, tipo, corpo, status)
     VALUES ($1, $2, $3, $4, 'entrada', 'texto', $5, 'recebida')`,
    [instancia.empresa_id, ticketId, contato.id, messageId, texto],
  );
}

// ------------------------------------------------------------
// Processa mensagens de grupos WhatsApp (@g.us)
// Só persiste se o grupo estiver com monitorado = TRUE.
// Toda a lógica roda em uma única transação/conexão.
// ------------------------------------------------------------
async function processarMensagemGrupo(
  instancia: { id: string; empresa_id: string },
  msg: Record<string, unknown>,
) {
  const key = msg.key as Record<string, unknown> | undefined;
  if (!key || key.fromMe) return;

  const groupJid = key.remoteJid as string;
  const participantJid = key.participant as string | null;
  const messageId = key.id as string;

  if (!groupJid || !messageId) return;

  await transaction(async (client) => {
    await _processarMensagemGrupoTx(
      client,
      instancia,
      msg,
      groupJid,
      participantJid,
      messageId,
    );
  });
}

async function _processarMensagemGrupoTx(
  client: PoolClient,
  instancia: { id: string; empresa_id: string },
  msg: Record<string, unknown>,
  groupJid: string,
  participantJid: string | null,
  messageId: string,
) {
  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    client.query(sql, params).then((r) => r.rows as T[]);
  const q1 = async <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => (await q<T>(sql, params))[0] ?? null;

  // Busca ou cria o registro do grupo (auto-criado com monitorado=TRUE)
  let grupo = await q1<{ id: string; monitorado: boolean }>(
    `SELECT id, monitorado FROM whatsapp_grupos
     WHERE instancia_id = $1 AND group_jid = $2 AND ativo = TRUE`,
    [instancia.id, groupJid],
  );

  if (!grupo) {
    const nomeGrupo =
      san((msg.pushName as string) ?? groupJid.replace("@g.us", "")) ??
      groupJid.replace("@g.us", "");
    const [novo] = await q<{ id: string; monitorado: boolean }>(
      `INSERT INTO whatsapp_grupos
         (empresa_id, instancia_id, group_jid, nome, monitorado, ativo)
       VALUES ($1, $2, $3, $4, TRUE, TRUE)
       ON CONFLICT (instancia_id, group_jid) DO UPDATE
         SET ativo = TRUE
       RETURNING id, monitorado`,
      [instancia.empresa_id, instancia.id, groupJid, nomeGrupo],
    );
    grupo = novo;
  }

  if (!grupo?.monitorado) return;

  // Deduplicação por message_id
  const existente = await q1(
    `SELECT id FROM whatsapp_grupos_mensagens
     WHERE message_id = $1 AND grupo_id = $2`,
    [messageId, grupo.id],
  );
  if (existente) return;

  // Extrai texto da mensagem
  const message = msg.message as Record<string, unknown> | undefined;
  const conteudo = san(
    (message?.conversation as string) ??
      ((message?.extendedTextMessage as Record<string, unknown>)
        ?.text as string) ??
      null,
  );

  // Determina tipo da mensagem
  let tipo = "texto";
  if (!conteudo) {
    if (message?.imageMessage) tipo = "imagem";
    else if (message?.audioMessage || message?.pttMessage) tipo = "audio";
    else if (message?.videoMessage) tipo = "video";
    else if (message?.documentMessage) tipo = "documento";
    else if (message?.stickerMessage) tipo = "sticker";
    else return;
  }

  const remetenteJid = participantJid ?? groupJid;
  const remetenteNome = san((msg.pushName as string) ?? null);

  // Captura reply/citação enviada pela Evolution API (contextInfo)
  const contextInfo = (message?.extendedTextMessage as Record<string, unknown>)
    ?.contextInfo as Record<string, unknown> | undefined;
  const quotedMessageId = (contextInfo?.stanzaId as string) ?? null;
  const quotedRemetenteJid = (contextInfo?.participant as string) ?? null;

  const [msgSalva] = await q<{ id: string }>(
    `INSERT INTO whatsapp_grupos_mensagens
       (empresa_id, grupo_id, message_id, remetente_jid, remetente_nome,
        tipo, conteudo, quoted_message_id, quoted_remetente_jid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      instancia.empresa_id,
      grupo.id,
      messageId,
      remetenteJid,
      remetenteNome,
      tipo,
      conteudo,
      quotedMessageId,
      quotedRemetenteJid,
    ],
  );

  if (!msgSalva) return;

  // ----------------------------------------------------------
  // Controle de interações de atendimento
  // ----------------------------------------------------------
  const operador = await q1<{ id: string }>(
    `SELECT id FROM usuarios
     WHERE empresa_id = $1
       AND SPLIT_PART(whatsapp_jid, '@', 1) = SPLIT_PART($2, '@', 1)
       AND perfil != 'cliente'
       AND ativo = true
     LIMIT 1`,
    [instancia.empresa_id, remetenteJid],
  );

  if (operador) {
    if (quotedMessageId) {
      await q(
        `UPDATE whatsapp_grupos_interacoes
         SET msg_resposta_id    = $1,
             operador_id        = $2,
             respondido_em      = NOW(),
             tempo_resposta_seg = EXTRACT(EPOCH FROM (NOW() - msg_criada_em))::int
         WHERE grupo_id       = $3
           AND respondido_em  IS NULL
           AND msg_cliente_id = (
             SELECT id FROM whatsapp_grupos_mensagens
             WHERE message_id = $4 AND grupo_id = $3
             LIMIT 1
           )`,
        [msgSalva.id, operador.id, grupo.id, quotedMessageId],
      );
    }

    await q(
      `UPDATE whatsapp_grupos_interacoes
       SET msg_resposta_id    = $1,
           operador_id        = $2,
           respondido_em      = NOW(),
           tempo_resposta_seg = EXTRACT(EPOCH FROM (NOW() - msg_criada_em))::int
       WHERE grupo_id       = $3
         AND respondido_em  IS NULL`,
      [msgSalva.id, operador.id, grupo.id],
    );
  } else {
    if (tipo === "texto" && conteudo) {
      await q(
        `INSERT INTO whatsapp_grupos_interacoes
           (empresa_id, grupo_id, msg_cliente_id, remetente_jid, remetente_nome, msg_criada_em)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          instancia.empresa_id,
          grupo.id,
          msgSalva.id,
          remetenteJid,
          remetenteNome,
        ],
      );
    }
  }
}
