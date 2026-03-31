import { query, queryOne } from "@/lib/db";
import { getIAConfig, verificarSeProblemaResolvido } from "@/lib/ia";
import { getEvolutionConfig } from "@/lib/whatsapp";

// ============================================================
// TIPOS
// ============================================================

interface ConfigMonitoramento {
  empresa_id: string;
  alerta_grupos_ativo: boolean;
  alerta_grupos_min: number;
  alerta_grupos_jid: string | null;
  alerta_grupos_usar_ia: boolean;
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
              alerta_grupos_usar_ia
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
    `SELECT
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
       AND EXTRACT(EPOCH FROM (NOW() - i.msg_criada_em)) > (COALESCE(g.sla_resposta_min, $2) * 60)
     ORDER BY i.msg_criada_em ASC`,
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
       AND criado_em   > $2
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
  interacaoId: string,
  motivo: string,
): Promise<void> {
  await query(
    `UPDATE whatsapp_grupos_interacoes
     SET auto_resolvido        = TRUE,
         auto_resolvido_motivo = $2,
         auto_resolvido_em     = NOW()
     WHERE id = $1`,
    [interacaoId, motivo],
  );
}

// ============================================================
// ENVIO DO ALERTA NO GRUPO DE SUPORTE
// ============================================================

async function enviarAlertaNoGrupo(
  config: { url: string; key: string; instance: string },
  suporteGroupJid: string,
  pendentes: Array<{ grupo_nome: string; remetente_nome: string | null; aguardando_min: number; motivo_ia?: string }>,
): Promise<void> {
  const linhas = pendentes.map((p) => {
    const cliente = p.remetente_nome ?? "Cliente";
    const base = `• *${p.grupo_nome}*: ${p.aguardando_min}min sem resposta (${cliente})`;
    return p.motivo_ia ? `${base}\n  _IA: ${p.motivo_ia}_` : base;
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

    // 2. Busca config Evolution API
    console.log("[Monitoramento] buscando Evolution config empresa=%s", empresaId);
    const evolutionConfig = await getEvolutionConfig(empresaId);
    if (!evolutionConfig) {
      console.warn("[Monitoramento] Evolution API não configurada. empresa=%s", empresaId);
      return resultado;
    }

    // 3. Busca interações pendentes além do threshold
    console.log("[Monitoramento] buscando interações pendentes empresa=%s threshold=%dmin", empresaId, config.alerta_grupos_min);
    const pendentes = await buscarInteracoesPendentes(empresaId, config.alerta_grupos_min);
    resultado.total_pendentes = pendentes.length;
    console.log("[Monitoramento] pendentes=%d empresa=%s", pendentes.length, empresaId);

    if (pendentes.length === 0) return resultado;

    // 4. Busca JIDs dos operadores (para identificar nas mensagens)
    const operadoresJids = await buscarOperadoresJids(empresaId);

    // 5. Busca config de IA (apenas se usar_ia estiver ativo)
    console.log("[Monitoramento] buscando IA config usar_ia=%s empresa=%s", config.alerta_grupos_usar_ia, empresaId);
    const iaConfig = config.alerta_grupos_usar_ia
      ? await getIAConfig(empresaId)
      : null;

    // 6. Para cada interação, decide se alerta ou suprime
    const paraAlertar: Array<{
      grupo_nome: string;
      remetente_nome: string | null;
      aguardando_min: number;
      motivo_ia?: string;
    }> = [];

    for (const interacao of pendentes) {
      // Busca mensagens posteriores à mensagem do cliente
      const mensagens = await buscarMensagensApos(
        interacao.grupo_id,
        interacao.msg_criada_em,
        operadoresJids,
      );

      // --- COM IA ---
      if (iaConfig?.ativo && config.alerta_grupos_usar_ia) {
        if (mensagens.length === 0) {
          // Sem nenhuma mensagem posterior → definitivamente pendente
          paraAlertar.push({
            grupo_nome: interacao.grupo_nome,
            remetente_nome: interacao.remetente_nome,
            aguardando_min: interacao.aguardando_min,
          });
          continue;
        }

        const verificacao = await verificarSeProblemaResolvido({
          config: iaConfig,
          empresaId,
          grupoNome: interacao.grupo_nome,
          mensagens,
        });

        if (verificacao.resolvido && verificacao.confianca >= 0.7) {
          // IA entendeu como resolvido com boa confiança → fecha sem alertar
          await marcarAutoResolvida(interacao.interacao_id, verificacao.motivo);
          resultado.auto_resolvidos++;
          resultado.alertas_suprimidos_ia++;
          continue;
        }

        // IA disse pendente → alerta com o motivo como contexto
        paraAlertar.push({
          grupo_nome: interacao.grupo_nome,
          remetente_nome: interacao.remetente_nome,
          aguardando_min: interacao.aguardando_min,
          motivo_ia: verificacao.motivo,
        });

      // --- SEM IA ---
      } else {
        paraAlertar.push({
          grupo_nome: interacao.grupo_nome,
          remetente_nome: interacao.remetente_nome,
          aguardando_min: interacao.aguardando_min,
        });
      }
    }

    // 7. Envia alerta consolidado no grupo de suporte
    if (paraAlertar.length > 0) {
      await enviarAlertaNoGrupo(evolutionConfig, config.alerta_grupos_jid, paraAlertar);
      resultado.alertas_enviados = paraAlertar.length;
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
