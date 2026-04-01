import { query, queryOne } from "@/lib/db";
import { getIAConfig, verificarSeProblemaResolvido, gerarEmbedding } from "@/lib/ia";
import { getEvolutionConfig } from "@/lib/whatsapp";

// ============================================================
// APRENDIZADO CONTÍNUO — salva decisões da IA na base vetorial
// ============================================================

/**
 * Registra uma decisão da IA generativa na base de conhecimento vetorial.
 * Na próxima ocorrência de mensagem semanticamente similar, a busca local
 * já resolve sem precisar chamar o LLM.
 *
 * Só salva quando:
 *  - A mensagem tem conteúdo suficiente (> 10 chars)
 *  - Nenhuma entrada muito similar já existe na base (distância cosine > 0.05)
 *  - O embedding é gerado com sucesso
 */
async function aprenderDaDecisaoIA(
  textoCliente: string,
  tipo: "resolucao" | "pendente",
  empresaId: string,
): Promise<void> {
  // Textos muito curtos não carregam semântica útil
  if (textoCliente.trim().length < 10) return;

  const embedding = await gerarEmbedding(textoCliente, empresaId);
  if (!embedding) return;

  // Formato array literal do PostgreSQL: {0.1,0.2,...}
  const vetorLiteral = `{${embedding.join(",")}}`;

  try {
    // Verifica duplicatas calculando cosseno em memória (sem pgvector)
    const existentes = await query<{ embedding: number[] | string[] }>(
      `SELECT embedding
       FROM grupos_resolucao_base
       WHERE (empresa_id = $1 OR empresa_id IS NULL)
         AND ativo     = TRUE
         AND embedding IS NOT NULL`,
      [empresaId],
    );

    const muitoSimilar = existentes.some((r) => {
      const emb = (r.embedding as (number | string)[]).map(Number);
      return cosineSimilarity(embedding, emb) > 0.95; // distância < 0.05
    });

    if (muitoSimilar) return;

    await query(
      `INSERT INTO grupos_resolucao_base (empresa_id, conteudo, tipo, embedding, origem)
       VALUES ($1, $2, $3, $4::float8[], 'ia_aprendizado')`,
      [empresaId, textoCliente.slice(0, 500), tipo, vetorLiteral],
    );

    console.log(
      "[Aprendizado] nova entrada adicionada empresa=%s tipo=%s texto=%.60s",
      empresaId, tipo, textoCliente,
    );
  } catch (err) {
    // Falha silenciosa — aprendizado é best-effort e não deve bloquear o monitoramento
    console.warn("[Aprendizado] falha ao salvar:", err);
  }
}

// ============================================================
// TIPOS
// ============================================================

interface ConfigMonitoramento {
  empresa_id: string;
  alerta_grupos_ativo: boolean;
  alerta_grupos_min: number;
  alerta_grupos_jid: string | null;
  alerta_grupos_usar_ia: boolean;
  alerta_grupos_instancia: string | null;
}

interface InteracaoPendente {
  interacao_id: string;
  grupo_id: string;
  grupo_nome: string;
  group_jid: string;
  remetente_jid: string;
  remetente_nome: string | null;
  msg_criada_em: Date;
  aguardando_min: number;
  sla_min: number;
}

interface MensagemGrupo {
  remetente_jid: string;
  remetente_nome: string | null;
  conteudo: string;
  criado_em: Date;
}

// ============================================================
// BASE DE CONHECIMENTO VETORIAL — ANÁLISE SEM IA GENERATIVA
// ============================================================

/** Similaridade de cosseno entre dois vetores de mesmo tamanho. */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface ResultadoAnaliseLocal {
  resolvido: boolean | null; // null = inconclusivo → chamar IA generativa
  confianca: number;
  motivo: string;
}

/**
 * Busca na base de conhecimento o padrão mais similar às mensagens do cliente.
 * Carrega os embeddings do banco e calcula a similaridade de cosseno em memória,
 * eliminando a dependência do pgvector.
 *
 * Retorna null se:
 * - OPENAI_API_KEY não configurada
 * - base de conhecimento estiver vazia / sem embeddings gerados
 * - similaridade abaixo do threshold
 */
async function buscarResolucaoPorSimilaridade(
  textoCliente: string,
  empresaId: string,
): Promise<{ tipo: "resolucao" | "abandono" | "pendente"; similaridade: number; conteudo: string } | null> {
  const embedding = await gerarEmbedding(textoCliente, empresaId);
  if (!embedding) return null;

  try {
    const rows = await query<{
      tipo: "resolucao" | "abandono" | "pendente";
      conteudo: string;
      embedding: number[] | string[];
    }>(
      `SELECT tipo, conteudo, embedding
       FROM grupos_resolucao_base
       WHERE (empresa_id = $1 OR empresa_id IS NULL)
         AND ativo     = TRUE
         AND embedding IS NOT NULL`,
      [empresaId],
    );

    if (rows.length === 0) return null;

    let best: { tipo: "resolucao" | "abandono" | "pendente"; conteudo: string; similaridade: number } | null = null;
    for (const row of rows) {
      const emb = (row.embedding as (number | string)[]).map(Number);
      const sim = cosineSimilarity(embedding, emb);
      if (!best || sim > best.similaridade) {
        best = { tipo: row.tipo, conteudo: row.conteudo, similaridade: sim };
      }
    }

    return best;
  } catch {
    return null;
  }
}

/**
 * Analisa mensagens sem chamar a IA generativa.
 *
 * Ordem de verificação:
 *  1. Operador enviou mensagem no thread → resolvido (95% confiança)
 *  2. Busca semântica via embedding <=> vetor na base de conhecimento
 *     - similaridade > 0.85 → usa classificação da base
 *  3. Inconclusivo → retorna null.resolvido → chamar IA generativa
 */
export async function analisarResolucaoLocal(
  mensagens: Array<{ remetente_jid: string; conteudo: string; eh_operador: boolean }>,
  empresaId: string,
): Promise<ResultadoAnaliseLocal> {
  // 1. Operador respondeu dentro do thread
  if (mensagens.some((m) => m.eh_operador)) {
    return {
      resolvido: true,
      confianca: 0.95,
      motivo: "Operador respondeu no grupo",
    };
  }

  // 2. Sem mensagens após o cliente → sem dados para busca semântica
  if (mensagens.length === 0) {
    return { resolvido: null, confianca: 0, motivo: "Sem mensagens para análise" };
  }

  // Concatena as últimas 3 mensagens do cliente como contexto para o embedding
  const textoCliente = mensagens
    .filter((m) => !m.eh_operador)
    .slice(-3)
    .map((m) => m.conteudo)
    .join(" | ");

  const match = await buscarResolucaoPorSimilaridade(textoCliente, empresaId);

  if (!match || match.similaridade < 0.82) {
    // Similaridade baixa ou base indisponível → inconclusivo
    return {
      resolvido: null,
      confianca: match?.similaridade ?? 0,
      motivo: "Inconclusivo — base de conhecimento não encontrou padrão próximo",
    };
  }

  if (match.tipo === "resolucao" || match.tipo === "abandono") {
    return {
      resolvido: true,
      confianca: match.similaridade,
      motivo: `Base de conhecimento: similar a "${match.conteudo}" (${(match.similaridade * 100).toFixed(0)}% sim.)`,
    };
  }

  // tipo === "pendente"
  return {
    resolvido: false,
    confianca: match.similaridade,
    motivo: `Base de conhecimento: similar a "${match.conteudo}" — cliente ainda aguarda`,
  };
}

// ============================================================
// BUSCA DE CONFIGURAÇÕES
// ============================================================

export async function buscarConfigMonitoramento(
  empresaId: string,
): Promise<ConfigMonitoramento | null> {
  try {
    const row = await queryOne<ConfigMonitoramento>(
      `SELECT empresa_id,
              alerta_grupos_ativo,
              alerta_grupos_min,
              alerta_grupos_jid,
              alerta_grupos_usar_ia,
              alerta_grupos_instancia
       FROM whatsapp_config
       WHERE empresa_id = $1`,
      [empresaId],
    );
    return row ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// BUSCA DE INTERAÇÕES PENDENTES ALÉM DO THRESHOLD
// ============================================================

export async function buscarInteracoesPendentes(
  empresaId: string,
  thresholdMin: number,
): Promise<InteracaoPendente[]> {
  const rows = await query<{
    interacao_id: string;
    grupo_id: string;
    grupo_nome: string;
    group_jid: string;
    remetente_jid: string;
    remetente_nome: string | null;
    msg_criada_em: Date;
    aguardando_min: number;
    sla_min: number;
  }>(
    `SELECT DISTINCT ON (g.id)
       i.id                                                         AS interacao_id,
       g.id                                                         AS grupo_id,
       g.nome                                                       AS grupo_nome,
       g.group_jid,
       i.remetente_jid,
       i.remetente_nome,
       i.msg_criada_em,
       (EXTRACT(EPOCH FROM (NOW() - i.msg_criada_em)) / 60)::int   AS aguardando_min,
       COALESCE(g.sla_resposta_min, $2)                            AS sla_min
     FROM whatsapp_grupos_interacoes i
     JOIN whatsapp_grupos g ON g.id = i.grupo_id
     WHERE i.empresa_id   = $1
       AND i.respondido_em IS NULL
       AND i.auto_resolvido = FALSE
       AND g.monitorado    = TRUE
       AND g.ativo         = TRUE
       AND i.msg_criada_em >= NOW() - INTERVAL '24 hours'
       AND EXTRACT(EPOCH FROM (NOW() - i.msg_criada_em)) > (COALESCE(g.sla_resposta_min, $2) * 60)
     ORDER BY g.id, i.msg_criada_em DESC`,
    [empresaId, thresholdMin],
  );

  return rows;
}

// ============================================================
// BUSCA DAS MENSAGENS APÓS A MENSAGEM DO CLIENTE
// ============================================================

async function buscarMensagensApos(
  grupoId: string,
  desde: Date,
  operadoresJids: string[],
): Promise<Array<MensagemGrupo & { eh_operador: boolean }>> {
  const rows = await query<MensagemGrupo>(
    `SELECT remetente_jid, remetente_nome, conteudo, criado_em
     FROM whatsapp_grupos_mensagens
     WHERE grupo_id    = $1
       AND criado_em   >= $2
       AND criado_em   >= NOW() - INTERVAL '24 hours'
       AND tipo        = 'texto'
       AND conteudo    IS NOT NULL
       AND LENGTH(conteudo) > 2
     ORDER BY criado_em DESC
     LIMIT 15`,
    [grupoId, desde],
  );

  return rows.reverse().map((m) => ({
    ...m,
    eh_operador: operadoresJids.includes(m.remetente_jid),
  }));
}

// ============================================================
// BUSCA DOS JIDs DOS OPERADORES DA EMPRESA
// ============================================================

async function buscarOperadoresJids(empresaId: string): Promise<string[]> {
  const rows = await query<{ whatsapp_jid: string }>(
    `SELECT whatsapp_jid
     FROM usuarios
     WHERE empresa_id    = $1
       AND ativo         = TRUE
       AND whatsapp_jid  IS NOT NULL
       AND perfil        IN ('admin', 'supervisor', 'operador')`,
    [empresaId],
  );
  return rows.map((r) => r.whatsapp_jid);
}

// ============================================================
// MARCA INTERAÇÃO COMO AUTO-RESOLVIDA
// ============================================================

async function marcarAutoResolvida(
  grupoId: string,
  motivo: string,
): Promise<void> {
  await query(
    `UPDATE whatsapp_grupos_interacoes
     SET auto_resolvido        = TRUE,
         auto_resolvido_motivo = $2,
         auto_resolvido_em     = NOW()
     WHERE grupo_id        = $1
       AND respondido_em   IS NULL
       AND auto_resolvido  = FALSE`,
    [grupoId, motivo],
  );
}

// ============================================================
// ENVIO DO ALERTA NO GRUPO DE SUPORTE
// ============================================================

async function enviarAlertaNoGrupo(
  config: { url: string; key: string; instance: string },
  suporteGroupJid: string,
  pendentes: Array<{
    grupo_nome: string;
    remetente_nome: string | null;
    aguardando_min: number;
    motivo_ia?: string;
    ultimas_msgs: Array<{ nome: string | null; conteudo: string }>;
  }>,
): Promise<void> {
  const linhas = pendentes.map((p) => {
    const linhasTitulo = `• *${p.grupo_nome}*: ${p.aguardando_min}min sem resposta`;

    const linhasMsgs = p.ultimas_msgs
      .slice(-3)
      .map((m) => `  💬 _${m.nome ?? "Cliente"}: "${m.conteudo.slice(0, 120)}"_`)
      .join("\n");

    const linhaIA = p.motivo_ia ? `  _[IA: ${p.motivo_ia}]_` : "";

    return [linhasTitulo, linhasMsgs, linhaIA].filter(Boolean).join("\n");
  });

  const texto =
    `⚠️ *Grupos aguardando atendimento*\n\n` +
    linhas.join("\n\n") +
    `\n\n_${pendentes.length} grupo(s) verificado(s) como pendente(s)._`;

  const apiUrl = `${config.url}/message/sendText/${config.instance}`;
  await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.key },
    body: JSON.stringify({ number: suporteGroupJid, text: texto }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ============================================================
// FUNÇÃO PRINCIPAL — EXECUTADA PELO CRON
// ============================================================

export interface ResultadoMonitoramento {
  empresa_id: string;
  total_pendentes: number;
  auto_resolvidos: number;
  alertas_enviados: number;
  alertas_suprimidos_ia: number;
  erro?: string;
}

export async function monitorarGruposDaEmpresa(
  empresaId: string,
): Promise<ResultadoMonitoramento> {
  const resultado: ResultadoMonitoramento = {
    empresa_id: empresaId,
    total_pendentes: 0,
    auto_resolvidos: 0,
    alertas_enviados: 0,
    alertas_suprimidos_ia: 0,
  };

  try {
    // 1. Busca configuração de monitoramento
    console.log("[Monitoramento] iniciando empresa=%s", empresaId);
    const config = await buscarConfigMonitoramento(empresaId);
    if (!config?.alerta_grupos_ativo) { console.log("[Monitoramento] monitoramento inativo empresa=%s", empresaId); return resultado; }
    if (!config.alerta_grupos_jid) {
      console.warn("[Monitoramento] alerta_grupos_jid não configurado. empresa=%s", empresaId);
      return resultado;
    }

    // 2. Busca config Evolution API — usa instância específica do monitoramento se configurada
    console.log("[Monitoramento] buscando Evolution config empresa=%s", empresaId);
    const evolutionConfig = await getEvolutionConfig(empresaId);
    if (!evolutionConfig) {
      console.warn("[Monitoramento] Evolution API não configurada. empresa=%s", empresaId);
      return resultado;
    }
    if (config.alerta_grupos_instancia) {
      evolutionConfig.instance = config.alerta_grupos_instancia;
    }

    // 3. Busca interações pendentes além do threshold
    console.log("[Monitoramento] buscando interações pendentes empresa=%s threshold=%dmin", empresaId, config.alerta_grupos_min);
    const pendentes = await buscarInteracoesPendentes(empresaId, config.alerta_grupos_min);
    resultado.total_pendentes = pendentes.length;
    console.log("[Monitoramento] pendentes=%d empresa=%s", pendentes.length, empresaId);

    if (pendentes.length === 0) return resultado;

    // 4. Busca JIDs dos operadores (para identificar nas mensagens)
    const operadoresJids = await buscarOperadoresJids(empresaId);

    // 5. Busca config de IA generativa (apenas se usar_ia estiver ativo)
    console.log("[Monitoramento] buscando IA config usar_ia=%s empresa=%s", config.alerta_grupos_usar_ia, empresaId);
    const iaConfig = config.alerta_grupos_usar_ia
      ? await getIAConfig(empresaId)
      : null;

    // 6. Para cada interação, decide se alerta ou suprime
    const paraAlertar: Array<{
      grupo_id: string;
      grupo_nome: string;
      remetente_nome: string | null;
      aguardando_min: number;
      motivo_ia?: string;
      ultimas_msgs: Array<{ nome: string | null; conteudo: string }>;
    }> = [];

    for (const interacao of pendentes) {
      // Busca mensagens posteriores à mensagem do cliente
      const mensagens = await buscarMensagensApos(
        interacao.grupo_id,
        interacao.msg_criada_em,
        operadoresJids,
      );

      // Últimas mensagens do cliente para exibir no alerta
      const msgsCliente = mensagens
        .filter((m) => !m.eh_operador)
        .slice(-3)
        .map((m) => ({ nome: m.remetente_nome, conteudo: m.conteudo }));

      // ── ETAPA 1: Base de conhecimento vetorial (sem custo de IA generativa) ─
      // Verifica operador respondeu + busca semântica embedding <=> vetor.
      // Resolve a maioria dos casos sem chamar LLM.
      const analiseLocal = await analisarResolucaoLocal(mensagens, empresaId);

      if (analiseLocal.resolvido === true && analiseLocal.confianca >= 0.82) {
        console.log(
          "[Monitoramento] [VETOR] resolvido grupo=%s motivo=%s sim=%.2f",
          interacao.grupo_nome, analiseLocal.motivo, analiseLocal.confianca,
        );
        await marcarAutoResolvida(interacao.grupo_id, analiseLocal.motivo);
        resultado.auto_resolvidos++;
        resultado.alertas_suprimidos_ia++;
        continue;
      }

      if (analiseLocal.resolvido === false && analiseLocal.confianca >= 0.82) {
        console.log(
          "[Monitoramento] [VETOR] pendente grupo=%s motivo=%s",
          interacao.grupo_nome, analiseLocal.motivo,
        );
        paraAlertar.push({
          grupo_id: interacao.grupo_id,
          grupo_nome: interacao.grupo_nome,
          remetente_nome: interacao.remetente_nome,
          aguardando_min: interacao.aguardando_min,
          ultimas_msgs: msgsCliente,
        });
        continue;
      }

      // ── ETAPA 2: IA generativa (só quando base vetorial é inconclusiva) ─────
      if (iaConfig?.ativo && config.alerta_grupos_usar_ia) {
        if (mensagens.length === 0) {
          paraAlertar.push({
            grupo_id: interacao.grupo_id,
            grupo_nome: interacao.grupo_nome,
            remetente_nome: interacao.remetente_nome,
            aguardando_min: interacao.aguardando_min,
            ultimas_msgs: msgsCliente,
          });
          continue;
        }

        console.log(
          "[Monitoramento] [IA] base vetorial inconclusiva (sim=%.2f) — enviando para LLM. grupo=%s",
          analiseLocal.confianca, interacao.grupo_nome,
        );
        const verificacao = await verificarSeProblemaResolvido({
          config: iaConfig,
          empresaId,
          grupoNome: interacao.grupo_nome,
          mensagens,
        });

        // Texto do cliente usado para aprendizado (últimas 3 msgs concatenadas)
        const textoAprendizado = msgsCliente.map((m) => m.conteudo).join(" | ");

        if (verificacao.resolvido && verificacao.confianca >= 0.7) {
          await marcarAutoResolvida(interacao.grupo_id, verificacao.motivo);
          resultado.auto_resolvidos++;
          resultado.alertas_suprimidos_ia++;
          // Aprende com a decisão da IA — fire and forget
          aprenderDaDecisaoIA(textoAprendizado, "resolucao", empresaId);
          continue;
        }

        // IA confirmou pendente com alta confiança — aprende esse padrão também
        if (verificacao.confianca >= 0.7) {
          aprenderDaDecisaoIA(textoAprendizado, "pendente", empresaId);
        }

        paraAlertar.push({
          grupo_id: interacao.grupo_id,
          grupo_nome: interacao.grupo_nome,
          remetente_nome: interacao.remetente_nome,
          aguardando_min: interacao.aguardando_min,
          motivo_ia: verificacao.motivo,
          ultimas_msgs: msgsCliente,
        });

      // ── SEM IA: base vetorial inconclusiva → alerta por precaução ────────────
      } else {
        paraAlertar.push({
          grupo_id: interacao.grupo_id,
          grupo_nome: interacao.grupo_nome,
          remetente_nome: interacao.remetente_nome,
          aguardando_min: interacao.aguardando_min,
          ultimas_msgs: msgsCliente,
        });
      }
    }

    // 7. Envia alerta consolidado no grupo de suporte e fecha TODAS as interações do grupo
    if (paraAlertar.length > 0) {
      await enviarAlertaNoGrupo(evolutionConfig, config.alerta_grupos_jid, paraAlertar);
      resultado.alertas_enviados = paraAlertar.length;

      // Fecha todas as interações abertas de cada grupo alertado (não só a do DISTINCT ON)
      for (const item of paraAlertar) {
        await marcarAutoResolvida(item.grupo_id, item.motivo_ia ?? "Alerta enviado para grupo de suporte");
        resultado.auto_resolvidos++;
      }
    }
  } catch (err) {
    resultado.erro = err instanceof Error ? err.message : String(err);
    console.error("[Monitoramento] Erro ao monitorar empresa=%s:", empresaId, err);
  }

  return resultado;
}

// ============================================================
// BUSCA TODAS AS EMPRESAS COM MONITORAMENTO ATIVO
// ============================================================

export async function buscarEmpresasComMonitoramento(): Promise<string[]> {
  const rows = await query<{ empresa_id: string }>(
    `SELECT empresa_id
     FROM whatsapp_config
     WHERE alerta_grupos_ativo = TRUE
       AND alerta_grupos_jid   IS NOT NULL`,
  );
  return rows.map((r) => r.empresa_id);
}
