import { query, queryOne } from "@/lib/db";

export interface EvolutionConfig {
  url: string;
  key: string;
  instance: string;
}

/**
 * Returns Evolution API config for a given empresa_id.
 * Priority: DB value > environment variable.
 */
export async function getEvolutionConfig(
  empresaId: string,
): Promise<EvolutionConfig | null> {
  try {
    const row = await queryOne<{
      evolution_api_url: string | null;
      evolution_api_key: string | null;
      evolution_instance: string | null;
    }>(
      `SELECT evolution_api_url, evolution_api_key, evolution_instance
       FROM whatsapp_config WHERE empresa_id = $1`,
      [empresaId],
    );

    const url = row?.evolution_api_url || process.env.EVOLUTION_API_URL || "";
    const key = row?.evolution_api_key || process.env.EVOLUTION_API_KEY || "";
    const instance =
      row?.evolution_instance || process.env.EVOLUTION_INSTANCE || "";

    if (!url || !key) return null;

    return { url, key, instance };
  } catch {
    // Columns may not exist yet (before first api-config save)
    const url = process.env.EVOLUTION_API_URL || "";
    const key = process.env.EVOLUTION_API_KEY || "";
    const instance = process.env.EVOLUTION_INSTANCE || "";
    if (!url || !key) return null;
    return { url, key, instance };
  }
}

/**
 * Normaliza número de telefone para o formato esperado pela Evolution API.
 * Remove caracteres não-dígitos e adiciona o DDI 55 (Brasil) se ausente.
 *
 * Exemplos:
 *   "(34) 9 9193-1617"  → "5534991931617"
 *   "34991931617"       → "5534991931617"
 *   "5534991931617"     → "5534991931617"
 *   "+55 34 99193-1617" → "5534991931617"
 */
export function normalizarTelefone(tel: string): string {
  const digitos = tel.replace(/\D/g, "");
  // Já tem DDI 55 e pelo menos 12 dígitos (55 + DDD 2 + número 8ou9)
  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  // Número brasileiro sem DDI (10 ou 11 dígitos)
  if (digitos.length === 10 || digitos.length === 11) return "55" + digitos;
  return digitos;
}

/**
 * Remove caracteres fora do repertório LATIN1 (ex.: emojis) para compatibilidade
 * com bancos PostgreSQL que usam encoding LATIN1/ISO-8859-1.
 * Substitui cada caractere fora do intervalo U+0000–U+00FF por '?'.
 */
function sanitizarLatin1(texto: string): string {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/[^\u0000-\u00FF]/g, "?");
}

/**
 * Rate limiting por instância Evolution.
 * Mantém o timestamp do último envio para garantir um intervalo mínimo entre
 * mensagens e evitar que a conta seja bloqueada por spam.
 */
const ultimoEnvio = new Map<string, number>();
const INTERVALO_MIN_MS = 1500; // 1,5 s entre mensagens da mesma instância

async function aguardarLimite(instancia: string): Promise<void> {
  const agora = Date.now();
  const ultimo = ultimoEnvio.get(instancia) ?? 0;
  const espera = INTERVALO_MIN_MS - (agora - ultimo);
  if (espera > 0) {
    await new Promise((r) => setTimeout(r, espera));
  }
  ultimoEnvio.set(instancia, Date.now());
}

/**
 * Envia mensagem WhatsApp via Evolution API para um número,
 * respeita o rate limit e persiste o registro em whatsapp_mensagens.
 */
async function enviarMensagem(
  config: EvolutionConfig,
  numero: string,
  texto: string,
  opts: {
    empresaId: string;
    ticketId?: string | null;
    contatoId?: string | null;
    agenteId?: string | null;
  },
): Promise<void> {
  await aguardarLimite(config.instance);

  const apiUrl = `${config.url}/message/sendText/${config.instance}`;
  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.key,
    },
    body: JSON.stringify({ number: numero, text: texto }),
  });

  // Captura message_id retornado pela Evolution API (melhor esforço)
  let messageId: string | null = null;
  try {
    const json = (await resp.json()) as Record<string, unknown>;
    messageId = ((json?.key as Record<string, unknown>)?.id as string) ?? null;
  } catch {
    // API não retornou JSON válido — ignora
  }

  // Persiste no banco (fire-and-forget — não bloqueia em caso de falha)
  // Sanitiza emojis/caracteres fora de LATIN1 antes de gravar
  const textoDb = sanitizarLatin1(texto);
  query(
    `INSERT INTO whatsapp_mensagens
       (empresa_id, ticket_id, contato_id, message_id, direcao, tipo, corpo, status, agente_id)
     VALUES ($1, $2, $3, $4, 'saida', 'texto', $5, 'enviada', $6)`,
    [
      opts.empresaId,
      opts.ticketId ?? null,
      opts.contatoId ?? null,
      messageId,
      textoDb,
      opts.agenteId ?? null,
    ],
  ).catch((err) =>
    console.error("[WhatsApp] Falha ao salvar mensagem enviada:", err),
  );
}

/** Garante que as colunas extras de whatsapp_contatos existam no banco. */
async function garantirColunasContatos(): Promise<void> {
  await query(`
    ALTER TABLE whatsapp_contatos
      ADD COLUMN IF NOT EXISTS id_departamentos UUID REFERENCES departamentos(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS usuarios_id      UUID REFERENCES usuarios(id)      ON DELETE SET NULL
  `);
}

/**
 * Notifica via WhatsApp os contatos configurados para receber alertas de novo ticket.
 *
 * Regra:
 *  - Se o ticket possui departamento_id, envia somente para contatos com
 *    id_departamentos = departamento_id OU id_departamentos IS NULL.
 *  - Se o ticket não possui departamento_id, envia para todos os contatos.
 */
export async function notificarWhatsappNovoTicket(params: {
  empresaId: string;
  ticketId: string;
  ticketNumero: string;
  ticketTitulo: string;
  prioridadeNome: string;
  departamentoId: string | null;
  departamentoNome?: string | null;
  abertoPorNome: string;
}): Promise<void> {
  try {
    const config = await getEvolutionConfig(params.empresaId);
    if (!config) {
      console.warn(
        "[WhatsApp] Config Evolution API não encontrada para empresa",
        params.empresaId,
      );
      return;
    }

    // Garante colunas antes de usar (auto-migração)
    await garantirColunasContatos();

    const contatos = await query<{
      id: string;
      numero: string;
      nome: string | null;
    }>(
      `SELECT wc.id, wc.numero, wc.nome
       FROM whatsapp_contatos wc
       WHERE wc.empresa_id = $1
         AND (
           $2::uuid IS NULL
           OR wc.id_departamentos IS NULL
           OR wc.id_departamentos = $2::uuid
         )`,
      [params.empresaId, params.departamentoId],
    );

    if (contatos.length === 0) {
      console.warn(
        "[WhatsApp] Nenhum contato encontrado para notificação. empresa=%s dept=%s",
        params.empresaId,
        params.departamentoId,
      );
      return;
    }

    const deptInfo = params.departamentoNome
      ? `\n🏢 *Departamento:* ${params.departamentoNome}`
      : "";

    const texto =
      `📋 *Novo chamado aberto!*\n` +
      `\n*Número:* #${params.ticketNumero}` +
      `\n*Título:* ${params.ticketTitulo}` +
      `\n*Prioridade:* ${params.prioridadeNome}` +
      `\n*Aberto por:* ${params.abertoPorNome}` +
      deptInfo;

    for (const c of contatos) {
      try {
        const numeroNormalizado = normalizarTelefone(c.numero);
        await enviarMensagem(config, numeroNormalizado, texto, {
          empresaId: params.empresaId,
          ticketId: params.ticketId,
          contatoId: c.id,
        });
        console.log("[WhatsApp] Mensagem enviada para", numeroNormalizado);
      } catch (err) {
        console.error("[WhatsApp] Falha ao enviar para", c.numero, err);
      }
    }
  } catch (err) {
    // Notificação WhatsApp nunca deve bloquear a criação do ticket
    console.error("[WhatsApp] Erro na notificação de novo ticket:", err);
  }
}

/**
 * Notifica via WhatsApp o atendente que recebeu a transferência de um chamado.
 * Usa o telefone cadastrado no usuário (campo telefone da tabela usuarios).
 */
export async function notificarWhatsappTransferencia(params: {
  empresaId: string;
  ticketId: string;
  ticketNumero: string;
  ticketTitulo: string;
  prioridadeNome: string;
  atribuidoAId: string;
  transferidoPorNome: string;
}): Promise<void> {
  try {
    const config = await getEvolutionConfig(params.empresaId);
    if (!config) return;

    const usuario = await queryOne<{ nome: string; telefone: string | null }>(
      `SELECT nome, telefone FROM usuarios WHERE id = $1`,
      [params.atribuidoAId],
    );

    if (!usuario?.telefone) {
      console.warn(
        "[WhatsApp] Atendente %s não tem telefone cadastrado, transferência não notificada.",
        params.atribuidoAId,
      );
      return;
    }

    const texto =
      `🔔 *Chamado transferido para você!*\n` +
      `\n*Número:* #${params.ticketNumero}` +
      `\n*Título:* ${params.ticketTitulo}` +
      `\n*Prioridade:* ${params.prioridadeNome}` +
      `\n*Transferido por:* ${params.transferidoPorNome}`;

    // Tenta associar ao contato WhatsApp cadastrado para este número
    const numeroNormalizado = normalizarTelefone(usuario.telefone);
    const contato = await queryOne<{ id: string }>(
      `SELECT id FROM whatsapp_contatos WHERE empresa_id = $1 AND numero = $2`,
      [params.empresaId, numeroNormalizado],
    );

    await enviarMensagem(config, numeroNormalizado, texto, {
      empresaId: params.empresaId,
      ticketId: params.ticketId,
      contatoId: contato?.id ?? null,
    });
    console.log("[WhatsApp] Transferência notificada para", numeroNormalizado);
  } catch (err) {
    console.error("[WhatsApp] Erro na notificação de transferência:", err);
  }
}
