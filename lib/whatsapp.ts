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
  session: string,
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
 * WPPConnect NÃO requer '@s.whatsapp.net' — usa apenas os dígitos.
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

  // 12 dígitos com DDI → só insere 9 se o número (após DDD) não começa com 9
  if (digitos.length === 12 && digitos.startsWith("55")) {
    const ddd = digitos.substring(2, 4);
    const num8 = digitos.substring(4);

    if (ddd === "11" || num8.startsWith("9")) {
      return digitos; // DDD 11 (SP) ou já tem 9 — mantém como está
    }

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

  // 10 dígitos (DDD + número) → adicionar DDI; adiciona 9 apenas se número não começa com 9
  if (digitos.length === 10) {
    const ddd = digitos.substring(0, 2);
    const numero8 = digitos.substring(2);
    if (numero8.startsWith("9")) {
      // Número já tem o 9 do formato pós-migração — só adiciona DDI
      return "55" + digitos; // Ex: 6499826408 → 556499826408
    }
    const corrigido = "55" + ddd + "9" + numero8;
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
 * Envia mensagem WhatsApp via WPPConnect para um número,
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
): Promise<{ isSendFailure: boolean }> {
  await aguardarLimite(config.instance);

  if (numero.length < 12 || numero.length > 13) {
    console.error('[WhatsApp] ❌ Número com tamanho inválido:', {
      numero,
      tamanho: numero.length,
      esperado: '12-13 dígitos (55 + DDD + número)',
    });
    throw new Error(`Número inválido: ${numero} (tamanho: ${numero.length})`);
  }

  const token = await generateWPPToken(config.url, config.key, config.instance);
  if (!token) {
    throw new Error("Não foi possível gerar token de autenticação WPPConnect");
  }

  const apiUrl = `${config.url}/api/${config.instance}/send-message`;
  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      phone: numero,
      message: texto,
      isGroup: false,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "Sem resposta");
    console.error("[WhatsApp] ❌ WPPConnect API erro HTTP:", {
      status: resp.status,
      statusText: resp.statusText,
      body: errorText.substring(0, 500),
      numero,
    });
    throw new Error(`WPPConnect API HTTP ${resp.status}: ${resp.statusText}`);
  }

  let messageId: string | null = null;
  let isSendFailure = false;
  try {
    const json = (await resp.json()) as Record<string, unknown>;
    if (json.status === "error" || json.error) {
      throw new Error(`WPPConnect API error: ${JSON.stringify(json)}`);
    }
    const responseArray = json.response as Array<Record<string, unknown>>;
    const firstMsg = responseArray?.[0];
    messageId = (firstMsg?.id as string) ?? null;
    isSendFailure = (firstMsg?.isSendFailure as boolean) === true;
    if (isSendFailure) {
      console.warn("[WhatsApp] ⚠️  isSendFailure=true para:", numero);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("WPPConnect API error")) {
      throw err;
    }
    console.warn("[WhatsApp] ⚠️  Response não é JSON válido (mensagem pode ter sido enviada)");
  }

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

  return { isSendFailure };
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

export interface ResultadoAlertaAtraso {
  empresa_id: string;
  tickets_atrasados: number;
  tickets_filtrados_operador_ativo: number;
  alertas_enviados: number;
  alertas_falhos: number;
  sem_telefone: number;
  alertas_cliente_enviados: number;
  alertas_cliente_falhos: number;
}

/**
 * Busca e alerta (via WhatsApp) os operadores responsáveis por chamados
 * com prazo de resolução vencido e ainda não fechados.
 *
 * Anti-spam: só reenvia se o último alerta foi há mais de 2 horas.
 * Requer coluna `ultimo_alerta_atraso_em` na tabela tickets (migration v1.14).
 */
export async function notificarWhatsappChamadosAtrasados(
  empresaId: string,
): Promise<ResultadoAlertaAtraso> {
  const resultado: ResultadoAlertaAtraso = {
    empresa_id: empresaId,
    tickets_atrasados: 0,
    tickets_filtrados_operador_ativo: 0,
    alertas_enviados: 0,
    alertas_falhos: 0,
    sem_telefone: 0,
    alertas_cliente_enviados: 0,
    alertas_cliente_falhos: 0,
  };

  try {
    const config = await getEvolutionConfig(empresaId);
    if (!config) {
      console.warn("[WhatsApp-Atraso] Config WPPConnect não encontrada para empresa %s", empresaId);
      return resultado;
    }

    // Tickets vencidos, abertos, atribuídos a um operador com telefone cadastrado.
    // Anti-spam: último alerta há mais de 2h ou nunca alertado.
    // Opção B: ignora chamado se o operador respondeu (mensagem pública) nas últimas 8h.
    const ticketsAtrasados = await query<{
      id: string;
      numero: string;
      titulo: string;
      prioridade_nome: string;
      sla_resolucao_deadline: Date;
      operador_id: string;
      operador_nome: string;
      operador_telefone: string | null;
      cliente_nome: string | null;
      cliente_usuario_id: string | null;
      cliente_usuario_nome: string | null;
      cliente_usuario_telefone: string | null;
    }>(
      `SELECT
         t.id, t.numero, t.titulo,
         tp.nome AS prioridade_nome,
         t.sla_resolucao_deadline,
         u.id  AS operador_id, u.nome AS operador_nome, u.telefone AS operador_telefone,
         c.nome_razao AS cliente_nome,
         ub.id        AS cliente_usuario_id,
         ub.nome      AS cliente_usuario_nome,
         ub.telefone  AS cliente_usuario_telefone
       FROM tickets t
       JOIN ticket_status     ts ON ts.id = t.status_id
       JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
       JOIN usuarios           u  ON u.id  = t.atribuido_a
       LEFT JOIN clientes      c  ON c.id  = t.cliente_id
       LEFT JOIN usuarios      ub ON ub.id = t.aberto_por
       WHERE t.empresa_id = $1
         AND ts.encerra  = FALSE
         AND t.fechado_em IS NULL
         AND t.sla_resolucao_deadline IS NOT NULL
         AND t.sla_resolucao_deadline < NOW()
         AND (
           t.ultimo_alerta_atraso_em IS NULL
           OR t.ultimo_alerta_atraso_em < NOW() - INTERVAL '2 hours'
         )
         AND NOT EXISTS (
           SELECT 1 FROM mensagens m
           WHERE m.ticket_id = t.id
             AND m.autor_id  = t.atribuido_a
             AND m.interna   = FALSE
             AND m.criado_em > NOW() - INTERVAL '8 hours'
         )
       ORDER BY t.sla_resolucao_deadline ASC`,
      [empresaId],
    );

    resultado.tickets_atrasados = ticketsAtrasados.length;

    if (ticketsAtrasados.length === 0) {
      console.log("[WhatsApp-Atraso] Nenhum chamado atrasado para empresa %s", empresaId);
      return resultado;
    }

    console.log(
      "[WhatsApp-Atraso] empresa=%s chamados_a_alertar=%d",
      empresaId,
      ticketsAtrasados.length,
    );

    for (const ticket of ticketsAtrasados) {
      if (!ticket.operador_telefone) {
        resultado.sem_telefone++;
        console.warn(
          "[WhatsApp-Atraso] Operador %s sem telefone (ticket #%s)",
          ticket.operador_nome,
          ticket.numero,
        );
        continue;
      }

      // Calcula quanto tempo está atrasado
      const atrasoMs = Date.now() - new Date(ticket.sla_resolucao_deadline).getTime();
      const atrasoHoras = Math.floor(atrasoMs / (1000 * 60 * 60));
      const atrasoMinutos = Math.floor((atrasoMs % (1000 * 60 * 60)) / (1000 * 60));
      const atrasoTexto =
        atrasoHoras > 0
          ? `${atrasoHoras}h${atrasoMinutos > 0 ? ` ${atrasoMinutos}min` : ""}`
          : `${atrasoMinutos}min`;

      const prazoTexto = new Date(Date.now() + 3 * 60 * 60 * 1000).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // --- NOTIFICAÇÃO AO CLIENTE (aberto_por) ---
      // Aviso extra a incluir na mensagem do operador caso o cliente não possa ser notificado
      let avisoNumeroCliente = "";

      const clienteEhDiferenteDoOperador =
        ticket.cliente_usuario_id && ticket.cliente_usuario_id !== ticket.operador_id;

      if (clienteEhDiferenteDoOperador) {
        if (!ticket.cliente_usuario_telefone) {
          avisoNumeroCliente =
            `\n\n⚠️ O cliente "${ticket.cliente_usuario_nome}" não possui telefone cadastrado.` +
            ` Adicione o contato no chamado #${ticket.numero} para que ele possa ser notificado.`;
          resultado.alertas_cliente_falhos++;
        } else {
          try {
            const numCliente = normalizarTelefone(ticket.cliente_usuario_telefone);
            const textoCliente =
              `📋 Chamado #${ticket.numero} — Aguardando retorno\n` +
              `\nOlá, ${ticket.cliente_usuario_nome}!\n` +
              `\nSeu chamado "${ticket.titulo}" está pendente de atualização pela nossa equipe.\n` +
              `\nCaso você já tenha mais informações ou precise de urgência, responda esta mensagem e nossa equipe será notificada.\n` +
              `\nDigitalRF`;

            const resCliente = await enviarMensagem(config, numCliente, textoCliente, {
              empresaId,
              ticketId: ticket.id,
              contatoId: null,
              agenteId: null,
            });

            if (resCliente.isSendFailure) {
              resultado.alertas_cliente_falhos++;
              avisoNumeroCliente =
                `\n\n⚠️ Número do cliente parece inválido ou sem WhatsApp ativo.` +
                ` Atualize o telefone de "${ticket.cliente_usuario_nome}" no chamado #${ticket.numero}.`;
              console.warn(
                "[WhatsApp-Atraso] ⚠️  isSendFailure cliente ticket=#%s tel=%s",
                ticket.numero,
                ticket.cliente_usuario_telefone,
              );
            } else {
              resultado.alertas_cliente_enviados++;
              console.log(
                "[WhatsApp-Atraso] ✅ Cliente notificado ticket=#%s numero=%s",
                ticket.numero,
                numCliente,
              );
            }

            // Pequena pausa entre envio ao cliente e ao operador
            await new Promise((r) => setTimeout(r, 1500));
          } catch (err) {
            resultado.alertas_cliente_falhos++;
            avisoNumeroCliente =
              `\n\n⚠️ Falha ao contatar o cliente "${ticket.cliente_usuario_nome}".` +
              ` Verifique o número cadastrado no chamado #${ticket.numero}.`;
            console.error(
              "[WhatsApp-Atraso] ❌ Erro ao notificar cliente ticket=#%s: %s",
              ticket.numero,
              err,
            );
          }
        }
      }

      // --- NOTIFICAÇÃO AO OPERADOR ---
      const texto =
        `⚠️ Chamado em atraso\n` +
        `\nNúmero: #${ticket.numero}` +
        `\nTítulo: ${ticket.titulo}` +
        `\nPrioridade: ${ticket.prioridade_nome}` +
        (ticket.cliente_nome ? `\nCliente: ${ticket.cliente_nome}` : "") +
        `\nTempo em atraso: ${atrasoTexto}` +
        `\n\nSolicitamos atuação neste chamado. Atualize o andamento, realize a resolução ou registre o motivo do impedimento.` +
        `\n\nPrazo para atualização: ${prazoTexto}` +
        avisoNumeroCliente +
        `\n\nDigitalRF`;

      try {
        const numeroNormalizado = normalizarTelefone(ticket.operador_telefone);

        // Busca contato cadastrado para registrar mensagem corretamente
        const contato = await queryOne<{ id: string }>(
          `SELECT id FROM whatsapp_contatos WHERE empresa_id = $1 AND numero = $2`,
          [empresaId, numeroNormalizado],
        );

        await enviarMensagem(config, numeroNormalizado, texto, {
          empresaId,
          ticketId: ticket.id,
          contatoId: contato?.id ?? null,
          agenteId: null,
        });

        // Atualiza timestamp do último alerta para controle anti-spam
        await query(
          `UPDATE tickets SET ultimo_alerta_atraso_em = NOW() WHERE id = $1`,
          [ticket.id],
        );

        resultado.alertas_enviados++;
        console.log(
          "[WhatsApp-Atraso] ✅ Alerta enviado ticket=#%s operador=%s numero=%s",
          ticket.numero,
          ticket.operador_nome,
          numeroNormalizado,
        );
      } catch (err) {
        resultado.alertas_falhos++;
        console.error(
          "[WhatsApp-Atraso] ❌ Falha ao alertar ticket=#%s operador=%s: %s",
          ticket.numero,
          ticket.operador_nome,
          err,
        );
      }

      // Pausa entre tickets para não sobrecarregar a instância WhatsApp
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (err) {
    console.error("[WhatsApp-Atraso] Erro crítico empresa=%s:", empresaId, err);
  }

  return resultado;
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

/**
 * Notifica via WhatsApp o operador responsável quando um cliente responde
 * numa conversa vinculada a um chamado.
 */
export async function notificarWhatsappRespostaCliente(params: {
  empresaId: string;
  ticketId: string;
  ticketNumero: string;
  ticketTitulo: string;
  operadorTelefone: string;
  clienteNome: string | null;
  mensagemTexto: string;
}): Promise<void> {
  try {
    const config = await getEvolutionConfig(params.empresaId);
    if (!config) return;

    const numeroNormalizado = normalizarTelefone(params.operadorTelefone);

    const textoMsg =
      params.mensagemTexto.length > 300
        ? params.mensagemTexto.substring(0, 297) + "..."
        : params.mensagemTexto;

    const texto =
      `💬 Resposta do cliente no chamado\n` +
      `\nNúmero: #${params.ticketNumero}` +
      `\nTítulo: ${params.ticketTitulo}` +
      (params.clienteNome ? `\nCliente: ${params.clienteNome}` : "") +
      `\n\n"${textoMsg}"\n\nDigitalRF`;

    const contato = await queryOne<{ id: string }>(
      `SELECT id FROM whatsapp_contatos WHERE empresa_id = $1 AND numero = $2`,
      [params.empresaId, numeroNormalizado],
    );

    await enviarMensagem(config, numeroNormalizado, texto, {
      empresaId: params.empresaId,
      ticketId: params.ticketId,
      contatoId: contato?.id ?? null,
      agenteId: null,
    });

    console.log(
      "[WhatsApp] ✅ Operador notificado resposta cliente ticket=#%s",
      params.ticketNumero,
    );
  } catch (err) {
    console.error("[WhatsApp] ❌ Erro ao notificar operador sobre resposta cliente:", err);
  }
}
