import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { query, queryOne } from "@/lib/db";
import type { Categoria } from "@/types";

// ============================================================
// TIPOS
// ============================================================

export interface IAConfig {
  provedor: "claude" | "openai";
  modelo: string;
  max_tokens: number;
  prompt_sugestao: string | null;
  prompt_classificar: string | null;
  prompt_resumir: string | null;
  prompt_whatsapp_bot: string | null;
  limite_diario: number;
  ativo: boolean;
  openai_api_key?: string | null;
}

export interface ClassificacaoTicket {
  categoria_id: string | null;
  prioridade_codigo: "baixa" | "normal" | "alta" | "urgente";
  confianca: number;
}

export interface RespostaWhatsApp {
  resposta: string;
  acao: "criar_ticket" | "escalar_humano" | null;
  confianca: number;
}

// ============================================================
// CONFIG
// ============================================================

/**
 * Retorna configuração de IA para a empresa.
 * Prioridade: banco > variáveis de ambiente > padrão.
 */
export async function getIAConfig(empresaId: string): Promise<IAConfig> {
  try {
    const row = await queryOne<IAConfig>(
      `SELECT provedor, modelo, max_tokens, prompt_sugestao, prompt_classificar,
              prompt_resumir, prompt_whatsapp_bot, limite_diario, ativo, openai_api_key
       FROM ia_config WHERE empresa_id = $1`,
      [empresaId],
    );
    if (row) return { ...row, provedor: row.provedor ?? "claude" };
  } catch {
    // tabela pode não existir ainda
  }

  return {
    provedor: "claude" as const,
    modelo: process.env.AI_MODEL ?? "claude-sonnet-4-20250514",
    max_tokens: parseInt(process.env.AI_MAX_TOKENS ?? "1024"),
    prompt_sugestao: null,
    prompt_classificar: null,
    prompt_resumir: null,
    prompt_whatsapp_bot: null,
    limite_diario: 500,
    ativo: true,
  };
}

// ============================================================
// HELPERS INTERNOS
// ============================================================

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurado");
  return new Anthropic({ apiKey: key });
}

function getOpenAIClient(config: IAConfig): OpenAI {
  const key = config.openai_api_key ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Chave OpenAI não configurada. Acesse Config → IA e informe sua API Key.");
  return new OpenAI({ apiKey: key });
}

// Helper unificado — chama Claude ou OpenAI conforme o provedor configurado
async function callIA(params: {
  config: IAConfig;
  system?: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<{ text: string; tokensEntrada: number; tokensSaida: number; latenciaMs: number }> {
  const inicio = Date.now();

  if (params.config.provedor === "openai") {
    const openai = getOpenAIClient(params.config);
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (params.system) messages.push({ role: "system", content: params.system });
    messages.push({ role: "user", content: params.userMessage });

    const res = await openai.chat.completions.create({
      model: params.config.modelo,
      max_tokens: params.maxTokens ?? params.config.max_tokens,
      messages,
    });

    return {
      text: res.choices[0]?.message?.content ?? "",
      tokensEntrada: res.usage?.prompt_tokens ?? 0,
      tokensSaida: res.usage?.completion_tokens ?? 0,
      latenciaMs: Date.now() - inicio,
    };
  }

  // Padrão: Claude
  const anthropic = getClient();
  const res = await anthropic.messages.create({
    model: params.config.modelo,
    max_tokens: params.maxTokens ?? params.config.max_tokens,
    system: params.system,
    messages: [{ role: "user", content: params.userMessage }],
  });

  return {
    text: res.content[0].type === "text" ? res.content[0].text : "",
    tokensEntrada: res.usage.input_tokens,
    tokensSaida: res.usage.output_tokens,
    latenciaMs: Date.now() - inicio,
  };
}

interface LogParams {
  empresaId: string;
  ticketId?: string | null;
  usuarioId?: string | null;
  tipo: string;
  promptResumido?: string;
  resposta?: string;
  tokensEntrada?: number;
  tokensSaida?: number;
  latenciaMs?: number;
  confianca?: number;
}

async function salvarLog(p: LogParams): Promise<void> {
  try {
    await query(
      `INSERT INTO ia_logs
         (empresa_id, ticket_id, usuario_id, tipo,
          prompt_resumido, resposta,
          tokens_entrada, tokens_saida, latencia_ms, confianca)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        p.empresaId,
        p.ticketId ?? null,
        p.usuarioId ?? null,
        p.tipo,
        p.promptResumido?.substring(0, 500) ?? null,
        p.resposta?.substring(0, 1000) ?? null,
        p.tokensEntrada ?? null,
        p.tokensSaida ?? null,
        p.latenciaMs ?? null,
        p.confianca ?? null,
      ],
    );
  } catch {
    // log não deve bloquear a resposta IA
  }
}

/**
 * Verifica se o limite diário de chamadas IA foi atingido.
 */
async function limiteAtingido(
  empresaId: string,
  limite: number,
): Promise<boolean> {
  if (limite <= 0) return false;
  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM ia_logs
     WHERE empresa_id = $1
       AND criado_em >= NOW() - INTERVAL '24 hours'`,
    [empresaId],
  );
  return (row?.total ?? 0) >= limite;
}

// ============================================================
// SUGESTÃO DE RESPOSTA
// ============================================================

/**
 * Gera sugestão de resposta para um agente com base no histórico do ticket.
 */
export async function sugerirResposta(
  ticketId: string,
  empresaId: string,
  usuarioId: string,
): Promise<string> {
  const config = await getIAConfig(empresaId);
  if (!config.ativo) throw new Error("IA desativada para esta empresa");
  if (await limiteAtingido(empresaId, config.limite_diario))
    throw new Error("Limite diário de chamadas IA atingido");

  const ticket = await queryOne<{
    titulo: string;
    descricao: string;
    numero: string;
    status_nome: string;
    prioridade_nome: string;
    categoria_nome: string | null;
    cliente_nome: string | null;
    empresa_nome: string;
  }>(
    `SELECT t.titulo, t.descricao, t.numero,
            ts.nome AS status_nome, tp.nome AS prioridade_nome,
            cat.nome AS categoria_nome, c.nome_razao AS cliente_nome,
            e.nome AS empresa_nome
     FROM tickets t
     JOIN ticket_status ts ON ts.id = t.status_id
     JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
     LEFT JOIN categorias cat ON cat.id = t.categoria_id
     LEFT JOIN clientes c ON c.id = t.cliente_id
     JOIN empresas e ON e.id = t.empresa_id
     WHERE t.id = $1 AND t.empresa_id = $2`,
    [ticketId, empresaId],
  );

  if (!ticket) throw new Error("Ticket não encontrado");

  const mensagens = await query<{
    autor_nome: string;
    corpo: string;
    criado_em: Date;
  }>(
    `SELECT u.nome AS autor_nome, m.corpo, m.criado_em
     FROM mensagens m
     JOIN usuarios u ON u.id = m.autor_id
     WHERE m.ticket_id = $1 AND m.interna = FALSE
     ORDER BY m.criado_em ASC
     LIMIT 20`,
    [ticketId],
  );

  const historico = mensagens
    .map((m) => `[${m.autor_nome}]: ${m.corpo}`)
    .join("\n\n");

  const promptSistema =
    config.prompt_sugestao ||
    `Você é um assistente de suporte da empresa ${ticket.empresa_nome}.
Seu papel é ajudar o agente a redigir respostas profissionais, claras e empáticas para tickets de suporte.

Contexto do ticket:
- Número: ${ticket.numero}
- Título: ${ticket.titulo}
- Categoria: ${ticket.categoria_nome ?? "Não definida"}
- Prioridade: ${ticket.prioridade_nome}
- Status: ${ticket.status_nome}
- Cliente: ${ticket.cliente_nome ?? "Não identificado"}

Histórico de mensagens:
${historico || "(sem mensagens anteriores)"}

Escreva uma resposta em português brasileiro, tom profissional mas acolhedor.
Máximo 3 parágrafos. Não invente informações técnicas que não estejam no contexto.
Retorne apenas o texto da resposta, sem saudações como "Prezado(a)" — o sistema adiciona automaticamente.`;

  const { text: texto, tokensEntrada, tokensSaida, latenciaMs: latencia } = await callIA({
    config,
    system: promptSistema,
    userMessage: `Ticket: ${ticket.titulo}\n\nDescrição original: ${ticket.descricao}`,
  });

  await salvarLog({
    empresaId,
    ticketId,
    usuarioId,
    tipo: "sugestao_resposta",
    promptResumido: ticket.titulo,
    resposta: texto,
    tokensEntrada,
    tokensSaida,
    latenciaMs: latencia,
  });

  return texto;
}

// ============================================================
// CLASSIFICAÇÃO DE TICKET
// ============================================================

/**
 * Classifica um ticket recém-aberto, sugerindo categoria e prioridade.
 */
export async function classificarTicket(
  titulo: string,
  descricao: string,
  categorias: Categoria[],
  empresaId: string,
  usuarioId?: string | null,
  ticketId?: string | null,
): Promise<ClassificacaoTicket> {
  const config = await getIAConfig(empresaId);
  if (!config.ativo) throw new Error("IA desativada para esta empresa");
  if (await limiteAtingido(empresaId, config.limite_diario))
    throw new Error("Limite diário de chamadas IA atingido");

  const listaCategorias = categorias
    .filter((c) => c.ativo)
    .map(
      (c) =>
        `- ID: ${c.id} | Nome: ${c.nome}${c.descricao ? ` (${c.descricao})` : ""}`,
    )
    .join("\n");

  const promptSistema =
    config.prompt_classificar ||
    `Você é um classificador automático de tickets de suporte.
Analise o título e a descrição do ticket e retorne uma classificação.

Categorias disponíveis:
${listaCategorias || "- (nenhuma categoria cadastrada)"}

Prioridades disponíveis: baixa, normal, alta, urgente

Regras de prioridade:
- urgente: sistema parado, perda de dados, impacto crítico em produção
- alta: funcionalidade importante com defeito, afeta muitos usuários
- normal: problema moderado, existe workaround
- baixa: dúvida, melhoria, impacto mínimo

Retorne APENAS um JSON válido no formato:
{ "categoria_id": "uuid-da-categoria-ou-null", "prioridade_codigo": "baixa|normal|alta|urgente", "confianca": 0.0 }`;

  const { text: textoRaw, tokensEntrada, tokensSaida, latenciaMs: latencia } = await callIA({
    config,
    system: promptSistema,
    userMessage: `Título: ${titulo}\n\nDescrição: ${descricao}`,
    maxTokens: 256,
  });
  const texto = textoRaw.trim() || "{}";

  let resultado: ClassificacaoTicket = {
    categoria_id: null,
    prioridade_codigo: "normal",
    confianca: 0.5,
  };

  try {
    // Extrai JSON mesmo que venha com texto adicional
    const match = texto.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const prioridadeValida = ["baixa", "normal", "alta", "urgente"].includes(
        parsed.prioridade_codigo,
      );
      resultado = {
        categoria_id: parsed.categoria_id ?? null,
        prioridade_codigo: prioridadeValida
          ? parsed.prioridade_codigo
          : "normal",
        confianca: Math.min(1, Math.max(0, Number(parsed.confianca ?? 0.5))),
      };
    }
  } catch {
    // Mantém padrão em caso de erro de parse
  }

  await salvarLog({
    empresaId,
    ticketId: ticketId ?? null,
    usuarioId: usuarioId ?? null,
    tipo: "classificacao",
    promptResumido: titulo,
    resposta: texto,
    tokensEntrada,
    tokensSaida,
    latenciaMs: latencia,
    confianca: resultado.confianca,
  });

  return resultado;
}

// ============================================================
// RESUMO DO TICKET
// ============================================================

/**
 * Gera um resumo do histórico de um ticket para orientar o agente.
 */
export async function resumirTicket(
  ticketId: string,
  empresaId: string,
  usuarioId: string,
): Promise<string> {
  const config = await getIAConfig(empresaId);
  if (!config.ativo) throw new Error("IA desativada para esta empresa");
  if (await limiteAtingido(empresaId, config.limite_diario))
    throw new Error("Limite diário de chamadas IA atingido");

  const ticket = await queryOne<{
    titulo: string;
    numero: string;
    descricao: string;
  }>(
    `SELECT titulo, numero, descricao
     FROM tickets WHERE id = $1 AND empresa_id = $2`,
    [ticketId, empresaId],
  );

  if (!ticket) throw new Error("Ticket não encontrado");

  const mensagens = await query<{
    autor_nome: string;
    corpo: string;
    interna: boolean;
    criado_em: Date;
  }>(
    `SELECT u.nome AS autor_nome, m.corpo, m.interna, m.criado_em
     FROM mensagens m
     JOIN usuarios u ON u.id = m.autor_id
     WHERE m.ticket_id = $1
     ORDER BY m.criado_em ASC
     LIMIT 30`,
    [ticketId],
  );

  const historico = mensagens
    .map((m) => `[${m.autor_nome}${m.interna ? " (interno)" : ""}]: ${m.corpo}`)
    .join("\n\n");

  const promptSistema =
    config.prompt_resumir ||
    `Você é um assistente de suporte. Gere um resumo conciso do histórico de um ticket de suporte.
O resumo deve ter 3-5 linhas, em português, cobrindo: problema original, ações tomadas e estado atual.
Seja objetivo e use linguagem técnica quando necessário. Não repita o título do ticket.`;

  const { text: texto, tokensEntrada, tokensSaida, latenciaMs: latencia } = await callIA({
    config,
    system: promptSistema,
    userMessage: `Ticket #${ticket.numero}: ${ticket.titulo}\n\nDescrição: ${ticket.descricao}\n\nHistórico:\n${historico || "(sem mensagens)"}`,
    maxTokens: 512,
  });

  await salvarLog({
    empresaId,
    ticketId,
    usuarioId,
    tipo: "resumo",
    promptResumido: ticket.titulo,
    resposta: texto,
    tokensEntrada,
    tokensSaida,
    latenciaMs: latencia,
  });

  return texto;
}

// ============================================================
// ANÁLISE DE MENSAGENS DE GRUPO WHATSAPP
// ============================================================

export interface AnaliseGrupo {
  id: string;
  grupo_id: string;
  periodo_inicio: Date;
  periodo_fim: Date;
  total_mensagens: number;
  total_participantes: number;
  resumo: string;
  sentimento: "positivo" | "neutro" | "negativo" | "misto";
  score_sentimento: number;
  topicos: Array<{ titulo: string; relevancia: number }>;
  participantes_ativos: Array<{ jid: string; nome: string | null; total: number }>;
  alertas: Array<{ tipo: string; descricao: string; mensagem_id?: string }>;
}

/**
 * Analisa mensagens de um grupo WhatsApp em um período e persiste o resultado.
 */
export async function analisarMensagensGrupo(params: {
  grupoId: string;
  empresaId: string;
  usuarioId: string;
  periodoInicio: Date;
  periodoFim: Date;
}): Promise<AnaliseGrupo> {
  const config = await getIAConfig(params.empresaId);
  if (!config.ativo) throw new Error("IA desativada para esta empresa");
  if (await limiteAtingido(params.empresaId, config.limite_diario))
    throw new Error("Limite diário de chamadas IA atingido");

  // Busca mensagens do período — limite reduzido para controlar consumo de tokens
  const mensagens = await query<{
    id: string;
    remetente_jid: string;
    remetente_nome: string | null;
    tipo: string;
    conteudo: string | null;
    criado_em: Date;
  }>(
    `SELECT id, remetente_jid, remetente_nome, tipo, conteudo, criado_em
     FROM whatsapp_grupos_mensagens
     WHERE grupo_id = $1
       AND criado_em >= $2
       AND criado_em <= $3
       AND tipo = 'texto'
       AND conteudo IS NOT NULL
       AND LENGTH(conteudo) > 2
     ORDER BY criado_em ASC
     LIMIT 150`,
    [params.grupoId, params.periodoInicio, params.periodoFim]
  );

  const totalMensagens = mensagens.length;

  // Conta participantes únicos (qualquer tipo de mensagem no período)
  const [partRow] = await query<{ total: string }>(
    `SELECT COUNT(DISTINCT remetente_jid) AS total
     FROM whatsapp_grupos_mensagens
     WHERE grupo_id = $1 AND criado_em >= $2 AND criado_em <= $3`,
    [params.grupoId, params.periodoInicio, params.periodoFim]
  );
  const totalParticipantes = parseInt(partRow?.total ?? "0");

  // Participantes mais ativos
  const participantesAtivos = await query<{
    jid: string;
    nome: string | null;
    total: string;
  }>(
    `SELECT remetente_jid AS jid, remetente_nome AS nome, COUNT(*) AS total
     FROM whatsapp_grupos_mensagens
     WHERE grupo_id = $1 AND criado_em >= $2 AND criado_em <= $3
     GROUP BY remetente_jid, remetente_nome
     ORDER BY total DESC
     LIMIT 10`,
    [params.grupoId, params.periodoInicio, params.periodoFim]
  );

  if (totalMensagens === 0) {
    // Sem mensagens no período — retorna análise vazia sem chamar a IA
    const [vazia] = await query<{ id: string }>(
      `INSERT INTO whatsapp_grupos_analises
         (empresa_id, grupo_id, periodo_inicio, periodo_fim,
          total_mensagens, total_participantes, resumo,
          sentimento, score_sentimento, topicos, participantes_ativos, alertas)
       VALUES ($1,$2,$3,$4,0,$5,'Nenhuma mensagem no período selecionado.',
               'neutro',0,'[]',$6,'[]')
       RETURNING id`,
      [
        params.empresaId,
        params.grupoId,
        params.periodoInicio,
        params.periodoFim,
        totalParticipantes,
        JSON.stringify(participantesAtivos.map((p) => ({ ...p, total: parseInt(p.total) }))),
      ]
    );
    return {
      id: vazia.id,
      grupo_id: params.grupoId,
      periodo_inicio: params.periodoInicio,
      periodo_fim: params.periodoFim,
      total_mensagens: 0,
      total_participantes: totalParticipantes,
      resumo: "Nenhuma mensagem no período selecionado.",
      sentimento: "neutro",
      score_sentimento: 0,
      topicos: [],
      participantes_ativos: participantesAtivos.map((p) => ({ ...p, total: parseInt(p.total) })),
      alertas: [],
    };
  }

  // Monta contexto para a IA (máximo ~2500 chars de mensagens)
  let contexto = "";
  for (const m of mensagens) {
    const nome = (m.remetente_nome ?? m.remetente_jid).split("@")[0];
    const linha = `[${nome}]: ${m.conteudo}\n`;
    if (contexto.length + linha.length > 2500) break;
    contexto += linha;
  }

  const prompt = `Você é um analista de grupos de WhatsApp corporativos.
Analise as mensagens abaixo e retorne um JSON com a estrutura exata:
{
  "resumo": "resumo em 3-5 linhas do que foi discutido",
  "sentimento": "positivo|neutro|negativo|misto",
  "score_sentimento": número de -1.0 a 1.0,
  "topicos": [{ "titulo": "...", "relevancia": 0.0 }],
  "alertas": [{ "tipo": "...", "descricao": "..." }]
}

Tipos de alerta possíveis: linguagem_ofensiva, spam, desinformacao, conflito_interno, urgencia_nao_atendida.
Se não houver alertas, retorne array vazio.
Retorne APENAS o JSON, sem texto adicional.

Período: ${params.periodoInicio.toLocaleDateString("pt-BR")} a ${params.periodoFim.toLocaleDateString("pt-BR")}
Total de mensagens analisadas: ${totalMensagens}

Mensagens:
${contexto}`;

  const { text: textoRaw, tokensEntrada, tokensSaida, latenciaMs: latencia } = await callIA({
    config,
    userMessage: prompt,
    maxTokens: 700,
  });
  const texto = textoRaw.trim() || "{}";

  // Parse do resultado da IA
  let resumo = "Análise concluída.";
  let sentimento: AnaliseGrupo["sentimento"] = "neutro";
  let scoreSentimento = 0;
  let topicos: AnaliseGrupo["topicos"] = [];
  let alertas: AnaliseGrupo["alertas"] = [];

  try {
    const match = texto.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      resumo         = parsed.resumo ?? resumo;
      const sentMap  = ["positivo", "neutro", "negativo", "misto"];
      sentimento     = sentMap.includes(parsed.sentimento) ? parsed.sentimento : "neutro";
      scoreSentimento = Math.min(1, Math.max(-1, Number(parsed.score_sentimento ?? 0)));
      topicos        = Array.isArray(parsed.topicos) ? parsed.topicos : [];
      alertas        = Array.isArray(parsed.alertas) ? parsed.alertas : [];
    }
  } catch {
    // Mantém padrão
  }

  const participantesFormatados = participantesAtivos.map((p) => ({
    jid: p.jid,
    nome: p.nome,
    total: parseInt(p.total),
  }));

  // Persiste a análise
  const [analise] = await query<{ id: string }>(
    `INSERT INTO whatsapp_grupos_analises
       (empresa_id, grupo_id, periodo_inicio, periodo_fim,
        total_mensagens, total_participantes, resumo,
        sentimento, score_sentimento, topicos,
        participantes_ativos, alertas,
        tokens_entrada, tokens_saida)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      params.empresaId,
      params.grupoId,
      params.periodoInicio,
      params.periodoFim,
      totalMensagens,
      totalParticipantes,
      resumo,
      sentimento,
      scoreSentimento,
      JSON.stringify(topicos),
      JSON.stringify(participantesFormatados),
      JSON.stringify(alertas),
      tokensEntrada,
      tokensSaida,
    ]
  );

  await salvarLog({
    empresaId: params.empresaId,
    usuarioId: params.usuarioId,
    tipo: "analise_grupo",
    promptResumido: `Grupo ${params.grupoId} — ${totalMensagens} msgs`,
    resposta: resumo,
    tokensEntrada,
    tokensSaida,
    latenciaMs: latencia,
  });

  return {
    id: analise.id,
    grupo_id: params.grupoId,
    periodo_inicio: params.periodoInicio,
    periodo_fim: params.periodoFim,
    total_mensagens: totalMensagens,
    total_participantes: totalParticipantes,
    resumo,
    sentimento,
    score_sentimento: scoreSentimento,
    topicos,
    participantes_ativos: participantesFormatados,
    alertas,
  };
}

// ============================================================
// VERIFICAÇÃO DE RESOLUÇÃO EM GRUPOS (MONITORAMENTO)
// ============================================================

export interface VerificacaoResolucao {
  resolvido: boolean;
  confianca: number;   // 0.0 a 1.0
  motivo: string;
}

/**
 * Analisa as mensagens posteriores à mensagem de um cliente em um grupo e
 * determina se o problema foi resolvido sem intervenção de um atendente.
 *
 * Usado pelo monitoramento automático antes de disparar alertas,
 * evitando notificações desnecessárias quando o próprio cliente se resolveu.
 */
export async function verificarSeProblemaResolvido(params: {
  config: IAConfig;
  empresaId: string;
  grupoNome: string;
  mensagens: Array<{
    remetente_nome: string | null;
    remetente_jid: string;
    conteudo: string;
    criado_em: Date;
    eh_operador: boolean;
  }>;
}): Promise<VerificacaoResolucao> {
  const contexto = params.mensagens
    .map((m) => {
      const papel = m.eh_operador ? "[ATENDENTE]" : "[CLIENTE]";
      const nome = m.remetente_nome ?? m.remetente_jid.split("@")[0];
      return `${papel} ${nome}: ${m.conteudo}`;
    })
    .join("\n");

  const prompt = `Analise as mensagens abaixo de um grupo de suporte chamado "${params.grupoNome}".
Determine se o problema ou dúvida do cliente foi resolvido ou encerrado, mesmo sem resposta oficial de um atendente.

Considere como RESOLVIDO quando:
- O cliente disse que resolveu, agradeceu ou confirmou que está ok
- O cliente indicou que não precisa mais de ajuda
- O assunto foi encerrado naturalmente pelo próprio cliente
- Mensagens posteriores indicam que o problema foi abandonado ou superado

Considere como PENDENTE quando:
- O cliente ainda está aguardando resposta
- O cliente fez uma pergunta sem obter resposta
- O cliente demonstrou frustração ou urgência sem resolução
- Não há mensagens posteriores indicando resolução

Retorne APENAS este JSON (sem texto adicional):
{
  "resolvido": true ou false,
  "confianca": número de 0.0 a 1.0,
  "motivo": "explicação curta em português"
}

Mensagens (da mais antiga para a mais recente):
${contexto}`;

  try {
    const iaPromise = callIA({
      config: params.config,
      userMessage: prompt,
      maxTokens: 256,
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("IA timeout (15s)")), 15_000),
    );
    const { text: textoRaw, tokensEntrada, tokensSaida, latenciaMs } = await Promise.race([iaPromise, timeout]);

    await salvarLog({
      empresaId: params.empresaId,
      tipo: "verificacao_resolucao_grupo",
      promptResumido: `Grupo ${params.grupoNome} — ${params.mensagens.length} msgs`,
      resposta: textoRaw,
      tokensEntrada,
      tokensSaida,
      latenciaMs,
    });

    const match = textoRaw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        resolvido: parsed.resolvido === true,
        confianca: Math.min(1, Math.max(0, Number(parsed.confianca ?? 0.5))),
        motivo: parsed.motivo ?? "Sem motivo retornado",
      };
    }
  } catch {
    // Em caso de falha, assume pendente para não suprimir alertas indevidamente
  }

  return { resolvido: false, confianca: 0, motivo: "Falha na análise IA" };
}

// ============================================================
// BOT WHATSAPP
// ============================================================

/**
 * Gera resposta automática para mensagem do WhatsApp.
 */
export async function responderWhatsApp(params: {
  numero: string;
  mensagem: string;
  historico: Array<{ direcao: string; corpo: string }>;
  clienteNome?: string | null;
  ticketNumero?: string | null;
  categorias?: Categoria[];
  empresaId: string;
  empresaNome: string;
}): Promise<RespostaWhatsApp> {
  const config = await getIAConfig(params.empresaId);
  if (!config.ativo) throw new Error("IA desativada para esta empresa");
  if (await limiteAtingido(params.empresaId, config.limite_diario))
    throw new Error("Limite diário de chamadas IA atingido");

  const historicoFormatado = params.historico
    .slice(-10)
    .map(
      (m) => `[${m.direcao === "entrada" ? "Cliente" : "Suporte"}]: ${m.corpo}`,
    )
    .join("\n");

  const categoriasList =
    params.categorias
      ?.filter((c) => c.ativo)
      .map((c) => `- ${c.nome}`)
      .join("\n") ?? "(não disponível)";

  const promptSistema =
    config.prompt_whatsapp_bot ||
    `Você é o assistente virtual de suporte da ${params.empresaNome} no WhatsApp.
Seja direto, simpático e útil. Responda em português brasileiro.

Dados do cliente: ${params.clienteNome ?? "não identificado"}
Ticket atual: ${params.ticketNumero ? `#${params.ticketNumero}` : "nenhum"}
Categorias de suporte: ${categoriasList}

Histórico recente:
${historicoFormatado || "(sem histórico)"}

Regras:
1. Se conseguir resolver com informação geral → responda diretamente
2. Se precisar criar ticket → use acao: "criar_ticket"
3. Se for urgente ou complexo → use acao: "escalar_humano"
4. Nunca prometa prazos que não estejam no SLA

Retorne APENAS JSON válido: { "resposta": "...", "acao": "criar_ticket|escalar_humano|null", "confianca": 0.0 }`;

  const { text: textoRaw, tokensEntrada, tokensSaida, latenciaMs: latencia } = await callIA({
    config,
    system: promptSistema,
    userMessage: params.mensagem,
  });
  const texto = textoRaw.trim() || '{"resposta":"Desculpe, não consegui processar sua mensagem.","acao":null,"confianca":0}';

  let resultado: RespostaWhatsApp = {
    resposta: "Desculpe, não consegui processar sua mensagem no momento.",
    acao: null,
    confianca: 0,
  };

  try {
    const match = texto.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const acaoValida = ["criar_ticket", "escalar_humano", null].includes(
        parsed.acao,
      );
      resultado = {
        resposta: parsed.resposta ?? resultado.resposta,
        acao: acaoValida ? parsed.acao : null,
        confianca: Math.min(1, Math.max(0, Number(parsed.confianca ?? 0))),
      };
    }
  } catch {
    // Mantém padrão
  }

  await salvarLog({
    empresaId: params.empresaId,
    tipo: "whatsapp_bot",
    promptResumido: params.mensagem,
    resposta: resultado.resposta,
    tokensEntrada,
    tokensSaida,
    latenciaMs: latencia,
    confianca: resultado.confianca,
  });

  return resultado;
}
