import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const empresaId =
    session?.empresaId ?? "00000000-0000-0000-0000-000000000001";

  const { searchParams } = req.nextUrl;
  const inicio = searchParams.get("inicio");
  const fim    = searchParams.get("fim");

  const params: unknown[] = [empresaId];
  const filtroData =
    inicio && fim
      ? `AND m.criado_em >= $2::timestamptz AND m.criado_em <= $3::timestamptz`
      : "";

  if (inicio && fim) {
    params.push(inicio, fim);
  }

  // Parâmetros para a subquery de interações (sempre presentes, NULL quando não filtrado)
  const paramsMensagens: unknown[] = [empresaId];
  const paramsInteracoes: unknown[] = [empresaId, inicio ?? null, fim ?? null];
  if (inicio && fim) paramsMensagens.push(inicio, fim);

  const filtroInteracoes = `
    AND ($2::timestamptz IS NULL OR i.msg_criada_em >= $2::timestamptz)
    AND ($3::timestamptz IS NULL OR i.msg_criada_em <= $3::timestamptz)
  `;

  // Agrega métricas de atendimento por operador separadamente
  const statsOperadores = await query<{
    operador_id:        string;
    respostas_dadas:    string;
    media_resposta_min: string | null;
    pct_dentro_sla:     string | null;
  }>(
    `SELECT
       i.operador_id,
       COUNT(i.id)::int                           AS respostas_dadas,
       ROUND(AVG(i.tempo_resposta_seg) / 60.0, 1) AS media_resposta_min,
       ROUND(
         100.0 * COUNT(*) FILTER (
           WHERE g.sla_resposta_min IS NULL
              OR i.tempo_resposta_seg <= (g.sla_resposta_min * 60)
         ) / NULLIF(COUNT(*), 0)
       , 1)                                       AS pct_dentro_sla
     FROM whatsapp_grupos_interacoes i
     JOIN whatsapp_grupos g ON g.id = i.grupo_id
     WHERE i.empresa_id   = $1
       AND i.respondido_em IS NOT NULL
       ${filtroInteracoes}
     GROUP BY i.operador_id`,
    paramsInteracoes,
  );

  // Mapa para lookup rápido por operador_id
  const statsMap = new Map(statsOperadores.map((s) => [s.operador_id, s]));

  const rows = await query<{
    remetente_jid:   string;
    remetente_nome:  string | null;
    numero:          string;
    total_mensagens: number;
    total_grupos:    number;
    usuario_id:      string | null;
    usuario_nome:    string | null;
    usuario_perfil:  string | null;
    instancia_nome:  string | null;
    eh_instancia:    boolean;
  }>(
    `SELECT
       m.remetente_jid,
       m.remetente_nome,
       SPLIT_PART(m.remetente_jid, '@', 1)   AS numero,
       COUNT(*)::int                          AS total_mensagens,
       COUNT(DISTINCT m.grupo_id)::int        AS total_grupos,
       u.id                                   AS usuario_id,
       u.nome                                 AS usuario_nome,
       u.perfil                               AS usuario_perfil,
       wi.nome_instancia                      AS instancia_nome,
       (wi.id IS NOT NULL)                    AS eh_instancia
     FROM whatsapp_grupos_mensagens m
     LEFT JOIN usuarios u
            ON u.empresa_id   = m.empresa_id
           AND SPLIT_PART(u.whatsapp_jid, '@', 1) = SPLIT_PART(m.remetente_jid, '@', 1)
           AND u.perfil      != 'cliente'
           AND u.ativo        = true
     LEFT JOIN whatsapp_instancias wi
            ON wi.empresa_id = m.empresa_id
           AND wi.numero     = SPLIT_PART(m.remetente_jid, '@', 1)
     WHERE m.empresa_id = $1
       ${filtroData}
     GROUP BY
       m.remetente_jid, m.remetente_nome,
       u.id, u.nome, u.perfil,
       wi.id, wi.nome_instancia
     ORDER BY total_mensagens DESC
     LIMIT 30`,
    paramsMensagens,
  );

  return NextResponse.json(
    rows.map((r) => {
      const stats = r.usuario_id ? statsMap.get(r.usuario_id) : undefined;
      return {
        ...r,
        respostas_dadas:    stats ? parseInt(stats.respostas_dadas) : 0,
        media_resposta_min: stats?.media_resposta_min ? parseFloat(stats.media_resposta_min) : null,
        pct_dentro_sla:     stats?.pct_dentro_sla    ? parseFloat(stats.pct_dentro_sla)    : null,
      };
    }),
  );
}
