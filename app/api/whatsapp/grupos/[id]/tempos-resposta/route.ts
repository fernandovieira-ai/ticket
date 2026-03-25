import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// GET /api/whatsapp/grupos/[id]/tempos-resposta
// Query params: desde (ISO), ate (ISO) — padrão: últimos 7 dias
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const grupo = await queryOne<{ id: string; nome: string; sla_resposta_min: number | null }>(
    `SELECT id, nome, sla_resposta_min FROM whatsapp_grupos
     WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  const sp    = req.nextUrl.searchParams;
  const ate   = sp.get("ate")   ? new Date(sp.get("ate")!)   : new Date();
  const desde = sp.get("desde") ? new Date(sp.get("desde")!) : new Date(ate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // sla em segundos (null quando não configurado)
  const slaSeg = grupo.sla_resposta_min != null ? grupo.sla_resposta_min * 60 : null;

  // KPIs gerais do período
  // PERCENTILE_CONT não suporta FILTER — usa CASE para excluir NULLs
  const kpis = await queryOne<{
    total_interacoes: string;
    respondidas:      string;
    sem_resposta:     string;
    media_seg:        string | null;
    mediana_seg:      string | null;
    mais_rapido_seg:  string | null;
    mais_lento_seg:   string | null;
    violacoes_sla:    string;
  }>(
    `SELECT
       COUNT(*)::int                                                       AS total_interacoes,
       COUNT(*) FILTER (WHERE respondido_em IS NOT NULL)::int             AS respondidas,
       COUNT(*) FILTER (WHERE respondido_em IS NULL)::int                 AS sem_resposta,
       ROUND(AVG(tempo_resposta_seg) FILTER (WHERE respondido_em IS NOT NULL), 0)
                                                                          AS media_seg,
       PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY CASE WHEN respondido_em IS NOT NULL THEN tempo_resposta_seg END
       )                                                                  AS mediana_seg,
       MIN(tempo_resposta_seg)                                            AS mais_rapido_seg,
       MAX(tempo_resposta_seg)                                            AS mais_lento_seg,
       COUNT(*) FILTER (
         WHERE respondido_em IS NOT NULL
           AND $4::int IS NOT NULL
           AND tempo_resposta_seg > $4::int
       )::int                                                             AS violacoes_sla
     FROM whatsapp_grupos_interacoes
     WHERE grupo_id       = $1
       AND msg_criada_em >= $2::timestamptz
       AND msg_criada_em <= $3::timestamptz`,
    [id, desde, ate, slaSeg]
  );

  // Ranking de operadores
  const porOperador = await query<{
    operador_id:     string;
    operador_nome:   string;
    respostas:       string;
    media_seg:       string | null;
    mediana_seg:     string | null;
    mais_rapido_seg: string | null;
    dentro_sla:      string;
  }>(
    `SELECT
       u.id                                                              AS operador_id,
       u.nome                                                           AS operador_nome,
       COUNT(i.id)::int                                                 AS respostas,
       ROUND(AVG(i.tempo_resposta_seg), 0)                             AS media_seg,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY i.tempo_resposta_seg)
                                                                       AS mediana_seg,
       MIN(i.tempo_resposta_seg)                                       AS mais_rapido_seg,
       COUNT(*) FILTER (
         WHERE $4::int IS NULL OR i.tempo_resposta_seg <= $4::int
       )::int                                                          AS dentro_sla
     FROM whatsapp_grupos_interacoes i
     JOIN usuarios u ON u.id = i.operador_id
     WHERE i.grupo_id       = $1
       AND i.respondido_em  IS NOT NULL
       AND i.msg_criada_em >= $2::timestamptz
       AND i.msg_criada_em <= $3::timestamptz
     GROUP BY u.id, u.nome
     ORDER BY media_seg ASC NULLS LAST`,
    [id, desde, ate, slaSeg]
  );

  // Distribuição por faixa de tempo
  const porFaixa = await query<{ faixa: string; total: string }>(
    `SELECT
       CASE
         WHEN tempo_resposta_seg <=   60 THEN 'ate_1min'
         WHEN tempo_resposta_seg <=  300 THEN '1_5min'
         WHEN tempo_resposta_seg <=  900 THEN '5_15min'
         WHEN tempo_resposta_seg <= 1800 THEN '15_30min'
         WHEN tempo_resposta_seg <= 3600 THEN '30_60min'
         ELSE 'acima_1h'
       END          AS faixa,
       COUNT(*)::int AS total
     FROM whatsapp_grupos_interacoes
     WHERE grupo_id       = $1
       AND respondido_em  IS NOT NULL
       AND msg_criada_em >= $2::timestamptz
       AND msg_criada_em <= $3::timestamptz
     GROUP BY 1
     ORDER BY MIN(tempo_resposta_seg)`,
    [id, desde, ate]
  );

  // Interações em aberto — não usa filtro de data, só $1 e $2
  const emAberto = await query<{
    id:             string;
    remetente_jid:  string;
    remetente_nome: string | null;
    msg_criada_em:  string;
    aguardando_seg: string;
    acima_sla:      boolean;
  }>(
    `SELECT
       i.id,
       i.remetente_jid,
       i.remetente_nome,
       i.msg_criada_em,
       EXTRACT(EPOCH FROM (NOW() - i.msg_criada_em))::int              AS aguardando_seg,
       ($2::int IS NOT NULL
        AND EXTRACT(EPOCH FROM (NOW() - i.msg_criada_em)) > $2::int)  AS acima_sla
     FROM whatsapp_grupos_interacoes i
     WHERE i.grupo_id      = $1
       AND i.respondido_em IS NULL
     ORDER BY i.msg_criada_em ASC`,
    [id, slaSeg]
  );

  // Tempo médio por hora do dia
  const porHora = await query<{ hora: string; total: string; media_seg: string | null }>(
    `SELECT
       EXTRACT(HOUR FROM msg_criada_em AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
       COUNT(*)::int                                                           AS total,
       ROUND(AVG(tempo_resposta_seg), 0)                                      AS media_seg
     FROM whatsapp_grupos_interacoes
     WHERE grupo_id       = $1
       AND respondido_em  IS NOT NULL
       AND msg_criada_em >= $2::timestamptz
       AND msg_criada_em <= $3::timestamptz
     GROUP BY 1
     ORDER BY 1`,
    [id, desde, ate]
  );

  return NextResponse.json({
    grupo: {
      id:               grupo.id,
      nome:             grupo.nome,
      sla_resposta_min: grupo.sla_resposta_min,
    },
    periodo: { desde: desde.toISOString(), ate: ate.toISOString() },
    kpis: {
      total_interacoes: parseInt(kpis?.total_interacoes ?? "0"),
      respondidas:      parseInt(kpis?.respondidas      ?? "0"),
      sem_resposta:     parseInt(kpis?.sem_resposta      ?? "0"),
      media_min:        kpis?.media_seg       ? Math.round(parseInt(kpis.media_seg)       / 60 * 10) / 10 : null,
      mediana_min:      kpis?.mediana_seg     ? Math.round(parseInt(kpis.mediana_seg)     / 60 * 10) / 10 : null,
      mais_rapido_min:  kpis?.mais_rapido_seg ? Math.round(parseInt(kpis.mais_rapido_seg) / 60 * 10) / 10 : null,
      mais_lento_min:   kpis?.mais_lento_seg  ? Math.round(parseInt(kpis.mais_lento_seg)  / 60 * 10) / 10 : null,
      violacoes_sla:    parseInt(kpis?.violacoes_sla ?? "0"),
    },
    por_operador: porOperador.map((r) => ({
      operador_id:     r.operador_id,
      operador_nome:   r.operador_nome,
      respostas:       parseInt(r.respostas),
      media_min:       r.media_seg       ? Math.round(parseInt(r.media_seg)       / 60 * 10) / 10 : null,
      mediana_min:     r.mediana_seg     ? Math.round(parseInt(r.mediana_seg)     / 60 * 10) / 10 : null,
      mais_rapido_min: r.mais_rapido_seg ? Math.round(parseInt(r.mais_rapido_seg) / 60 * 10) / 10 : null,
      dentro_sla:      parseInt(r.dentro_sla),
      pct_sla:         grupo.sla_resposta_min
        ? Math.round((parseInt(r.dentro_sla) / parseInt(r.respostas)) * 100)
        : null,
    })),
    por_faixa: porFaixa.map((r) => ({
      faixa: r.faixa,
      total: parseInt(r.total),
    })),
    em_aberto: emAberto.map((r) => ({
      id:             r.id,
      remetente_jid:  r.remetente_jid,
      remetente_nome: r.remetente_nome,
      msg_criada_em:  r.msg_criada_em,
      aguardando_min: Math.round(parseInt(r.aguardando_seg) / 60 * 10) / 10,
      acima_sla:      r.acima_sla,
    })),
    por_hora: porHora.map((r) => ({
      hora:      parseInt(r.hora),
      total:     parseInt(r.total),
      media_min: r.media_seg ? Math.round(parseInt(r.media_seg) / 60 * 10) / 10 : null,
    })),
  });
}
