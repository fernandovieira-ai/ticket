import { query, queryOne } from "@/lib/db";

export interface EvolutionConfig {
  url: string;
  key: string; // SECRET_KEY do WPPConnect (THISISMYSECURETOKEN)
  instance: string;
}

/**
 * Gera token de autenticação temporário para WPPConnect.
 * O token é gerado a cada requisição usando a SECRET_KEY.
 */
export async function generateWPPToken(
  baseUrl: string,
  secretKey: string,
  session: string
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/${session}/${secretKey}/generate-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns WPPConnect API config for a given empresa_id.
 * Priority: DB value > environment variable.
 * (Interface mantém nome EvolutionConfig por compatibilidade)
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
 * Normaliza número de telefone para o formato esperado pela WPPConnect API.
 * Remove caracteres não-dígitos e adiciona o DDI 55 (Brasil) se ausente.
 *
 * **FORMATO WPPConnect:**
 * Retorna apenas os 13 dígitos (DDI + DDD + 9 + número).
 * WPPConnect NÃO requer '@lid' ou '@s.whatsapp.net' - ele adiciona automaticamente.
 *
 * Exemplos:
 *   "(34) 9 9193-1617"  → "5534991931617"
 *   "34991931617"       → "5534991931617"
 *   "5534991931617"     → "5534991931617"
 *   "+55 34 99193-1617" → "5534991931617"
 *   "3491234567"        → "5534991234567" (adiciona DDI + 9)
 */
export function normalizarTelefone(tel: string): string {
  const digitos = tel.replace(/\D/g, "");

  // Já tem DDI 55 e 13 dígitos (completo) → retorna direto
  if (digitos.startsWith("55") && digitos.length === 13) {
    return digitos; // Ex: 5534991234567
  }

  // 12 dígitos com DDI mas SEM o 9 → inserir 9 após DDD
  if (digitos.length === 12 && digitos.startsWith("55")) {
    const ddd = digitos.substring(2, 4);

    // DDD 11 (SP): alguns fixos não usam 9
    if (ddd === "11") {
      return digitos; // Mantém 12 dígitos
    }

    // Outros DDDs: inserir 9
    const corrigido = digitos.substring(0, 4) + "9" + digitos.substring(4);
    console.log('[WhatsApp] Número corrigido (inserido 9):', {
      original: tel,
      antes: digitos,
      depois: corrigido,
    });
    return corrigido;
  }

  // 11 dígitos (DDD + 9 + número) → adicionar DDI 55
  if (digitos.length === 11) {
    return "55" + digitos; // Ex: 34991234567 → 5534991234567
  }

  // 10 dígitos (DDD + número SEM 9) → adicionar DDI e 9
  if (digitos.length === 10) {
    const ddd = digitos.substring(0, 2);
    const numero = digitos.substring(2);
    const corrigido = "55" + ddd + "9" + numero;
    console.log('[WhatsApp] Número corrigido (adicionado DDI + 9):', {
      original: tel,
      antes: digitos,
      depois: corrigido,
    });
    return corrigido;
  }

  // Formato inesperado → retorna como está
  console.warn('[WhatsApp] ⚠️  Formato inesperado:', {
    original: tel,
    digitos,
    tamanho: digitos.length,
  });
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

  // ✅ VALIDAR NÚMERO ANTES DE ENVIAR
  if (numero.length < 12 || numero.length > 13) {
    console.error('[WhatsApp] ❌ Número com tamanho inválido:', {
      numero,
      tamanho: numero.length,
      esperado: '12-13 dígitos (55 + DDD + número)',
    });
    throw new Error(`Número inválido: ${numero} (tamanho: ${numero.length})`);
  }

  // Gerar token temporário usando SECRET_KEY
  const token = await generateWPPToken(config.url, config.key, config.instance);
  if (!token) {
    throw new Error('Não foi possível gerar token de autenticação WPPConnect');
  }

  // WPPConnect API - URL format: /api/{session}/send-message
  const apiUrl = `${config.url}/api/${config.instance}/send-message`;
  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,  // Token gerado dinamicamente
    },
    body: JSON.stringify({
      phone: numero,     // WPPConnect usa "phone" (13 dígitos sem @lid)
      message: texto,    // WPPConnect usa "message"
      isGroup: false
    }),
  });

  // ✅ VALIDAR RESPONSE HTTP
  if (!resp.ok) {
    const errorText = await resp.text().catch(() => 'Sem resposta');
    console.error('[WhatsApp] ❌ WPPConnect API erro HTTP:', {
      status: resp.status,
      statusText: resp.statusText,
      body: errorText.substring(0, 500),
      numero,
    });
    throw new Error(`WPPConnect API HTTP ${resp.status}: ${resp.statusText}`);
  }

  // ✅ PARSE JSON E VERIFICAR ERRO
  let messageId: string | null = null;
  try {
    const json = (await resp.json()) as Record<string, unknown>;

    // WPPConnect retorna {status: "success", response: [...]}
    if (json.status === 'error' || json.error) {
      console.error('[WhatsApp] ❌ WPPConnect API retornou erro:', {
        response: json,
        numero,
      });
      throw new Error(`WPPConnect API error: ${JSON.stringify(json)}`);
    }

    // Extrair message ID do primeiro item da resposta
    const responseArray = json.response as Array<Record<string, unknown>>;
    messageId = responseArray?.[0]?.id as string ?? null;
  } catch (err) {
    // Se já foi lançado acima, re-throw
    if (err instanceof Error && err.message.includes('WPPConnect API error')) {
      throw err;
    }
    // Senão, API não retornou JSON válido — continua mesmo assim
    console.warn('[WhatsApp] ⚠️  Response não é JSON válido (mensagem pode ter sido enviada)');
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

/** Verifica se as colunas extras existem na tabela whatsapp_contatos */
async function verificarColunasContatos(): Promise<boolean> {
  try {
    const result = await queryOne<{ has_columns: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'whatsapp_contatos'
           AND column_name = 'id_departamentos'
       ) AS has_columns`
    );
    return result?.has_columns ?? false;
  } catch (err) {
    console.error('[WhatsApp] Erro ao verificar colunas:', err);
    return false;
  }
}

/** Garante que as colunas extras de whatsapp_contatos existam no banco. */
async function garantirColunasContatos(): Promise<boolean> {
  try {
    await query(`
      ALTER TABLE whatsapp_contatos
        ADD COLUMN IF NOT EXISTS id_departamentos UUID REFERENCES departamentos(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS usuarios_id      UUID REFERENCES usuarios(id)      ON DELETE SET NULL
    `);
    console.log('[WhatsApp] ✅ Colunas verificadas/criadas com sucesso');
    return true;
  } catch (err) {
    console.error('[WhatsApp] ⚠️  Erro ao criar colunas (continuando sem elas):', err);
    return false;
  }
}

/**
 * Notifica via WhatsApp os contatos configurados para receber alertas de novo ticket.
 *
 * Regra:
 *  - Se o ticket possui departamento_id, envia somente para contatos com
 *    id_departamentos = departamento_id OU id_departamentos IS NULL.
 *  - Se o ticket não possui departamento_id, envia para todos os contatos.
 *
 * Melhorias v2:
 *  - Logs detalhados em cada etapa
 *  - Tratamento robusto de erros
 *  - Verificação de colunas antes de usar
 *  - Resumo final de envios
 */
export async function notificarWhatsappNovoTicket(params: {
  empresaId: string;
  ticketId: string;
  ticketNumero: string;
  ticketTitulo: string;
  prioridadeNome: string;
  departamentoId: string | null;
  departamentoNome?: string | null;
  categoriaNome?: string | null;
  subcategoriaNome?: string | null;
  abertoPorNome: string;
}): Promise<void> {
  const startTime = Date.now();

  console.log('[WhatsApp] 🚀 Iniciando notificação de novo ticket', {
    ticketNumero: params.ticketNumero,
    empresaId: params.empresaId,
    departamentoId: params.departamentoId,
  });

  try {
    // ETAPA 1: Buscar Config WPPConnect API
    const config = await getEvolutionConfig(params.empresaId);
    if (!config) {
      console.error('[WhatsApp] ❌ Config WPPConnect API não encontrada', {
        empresaId: params.empresaId,
      });
      return;
    }
    console.log('[WhatsApp] ✅ Config WPPConnect encontrada');

    // ETAPA 2: Verificar e garantir colunas
    const hasColumns = await verificarColunasContatos();
    if (!hasColumns) {
      console.warn('[WhatsApp] ⚠️  Colunas não existem, tentando criar...');
      await garantirColunasContatos();
    }

    // ETAPA 3: Buscar contatos
    let contatos: Array<{ id: string; numero: string; nome: string | null }> = [];
    const hasColumnsNow = await verificarColunasContatos();

    if (hasColumnsNow) {
      console.log('[WhatsApp] 🔍 Buscando contatos com filtro de departamento');
      contatos = await query<{ id: string; numero: string; nome: string | null }>(
        `SELECT wc.id, wc.numero, wc.nome
         FROM whatsapp_contatos wc
         WHERE wc.empresa_id = $1
           AND (
             $2::uuid IS NULL
             OR wc.id_departamentos IS NULL
             OR wc.id_departamentos = $2::uuid
           )`,
        [params.empresaId, params.departamentoId]
      );
    } else {
      console.warn('[WhatsApp] ⚠️  Buscando todos contatos (sem filtro)');
      contatos = await query<{ id: string; numero: string; nome: string | null }>(
        `SELECT id, numero, nome FROM whatsapp_contatos WHERE empresa_id = $1`,
        [params.empresaId]
      );
    }

    console.log('[WhatsApp] 📋 Contatos encontrados:', contatos.length);

    if (contatos.length === 0) {
      console.error('[WhatsApp] ❌ Nenhum contato encontrado');
      return;
    }

    // ETAPA 4: Enviar mensagens
    const deptInfo = params.departamentoNome
      ? `\n🏢 *Departamento:* ${params.departamentoNome}`
      : "";

    const categoriaInfo = params.categoriaNome
      ? `\n📂 *Categoria:* ${params.categoriaNome}`
      : "";

    const subcategoriaInfo = params.subcategoriaNome
      ? `\n📁 *Subcategoria:* ${params.subcategoriaNome}`
      : "";

    const texto =
      `📋 *Novo chamado aberto!*\n` +
      `\n*Número:* #${params.ticketNumero}` +
      `\n*Título:* ${params.ticketTitulo}` +
      `\n*Prioridade:* ${params.prioridadeNome}` +
      `\n*Aberto por:* ${params.abertoPorNome}` +
      deptInfo +
      categoriaInfo +
      subcategoriaInfo;

    let sucessos = 0;
    let falhas = 0;

    for (const c of contatos) {
      try {
        const numeroNormalizado = normalizarTelefone(c.numero);
        await enviarMensagem(config, numeroNormalizado, texto, {
          empresaId: params.empresaId,
          ticketId: params.ticketId,
          contatoId: c.id,
        });
        sucessos++;
        console.log(`[WhatsApp] ✅ Enviado para ${numeroNormalizado}`);
      } catch (err) {
        falhas++;
        console.error(`[WhatsApp] ❌ Falha ao enviar para ${c.numero}:`, err);
      }
    }

    // ETAPA 5: Resumo
    const duration = Date.now() - startTime;
    console.log('[WhatsApp] 📊 Resumo:', {
      total: contatos.length,
      sucesso: sucessos,
      falha: falhas,
      tempoMs: duration,
    });
  } catch (err) {
    console.error('[WhatsApp] ❌ Erro crítico:', err);
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
