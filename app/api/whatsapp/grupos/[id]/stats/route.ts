import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// GET /api/whatsapp/grupos/[id]/stats
// Query params: desde (ISO), ate (ISO) — padrão: últimos 7 dias
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const grupo = await queryOne<{ id: string; nome: string; total_membros: number }>(
    `SELECT id, nome, total_membros FROM whatsapp_grupos WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  const sp  = req.nextUrl.searchParams;
  const ate   = sp.get("ate")   ? new Date(sp.get("ate")!)   : new Date();
  const desde = sp.get("desde") ? new Date(sp.get("desde")!) : new Date(ate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Mensagens por dia
  const porDia = await query<{ dia: string; total: string }>(
    `SELECT TO_CHAR(DATE_TRUNC('day', criado_em), 'YYYY-MM-DD') AS dia,
            COUNT(*) AS total
     FROM whatsapp_grupos_mensagens
     WHERE grupo_id = $1 AND criado_em >= $2 AND criado_em <= $3
     GROUP BY dia
     ORDER BY dia ASC`,
    [id, desde, ate]
  );

  // 2. Mensagens por tipo
  const porTipo = await query<{ tipo: string; total: string }>(
    `SELECT tipo, COUNT(*) AS total
     FROM whatsapp_grupos_mensagens
     WHERE grupo_id = $1 AND criado_em >= $2 AND criado_em <= $3
     GROUP BY tipo
     ORDER BY total DESC`,
    [id, desde, ate]
  );

  // 3. Top 10 participantes
  const topParticipantes = await query<{ jid: string; nome: string | null; total: string }>(
    `SELECT remetente_jid AS jid, remetente_nome AS nome, COUNT(*) AS total
     FROM whatsapp_grupos_mensagens
     WHERE grupo_id = $1 AND criado_em >= $2 AND criado_em <= $3
     GROUP BY remetente_jid, remetente_nome
     ORDER BY total DESC
     LIMIT 10`,
    [id, desde, ate]
  );

  // 4. Total geral no período
  const [totals] = await query<{ total: string; participantes: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT remetente_jid) AS participantes
     FROM whatsapp_grupos_mensagens
     WHERE grupo_id = $1 AND criado_em >= $2 AND criado_em <= $3`,
    [id, desde, ate]
  );

  // 5. Última análise IA
  const ultimaAnalise = await queryOne<{
    id: string;
    resumo: string;
    sentimento: string;
    score_sentimento: number;
    topicos: unknown;
    alertas: unknown;
    total_mensagens: number;
    criado_em: string;
  }>(
    `SELECT id, resumo, sentimento, score_sentimento, topicos, alertas,
            total_mensagens, criado_em
     FROM whatsapp_grupos_analises
     WHERE grupo_id = $1 AND empresa_id = $2
     ORDER BY criado_em DESC
     LIMIT 1`,
    [id, session.empresaId]
  );

  // 6. Histórico de sentimento (últimas 10 análises)
  const historicoSentimento = await query<{
    periodo_inicio: string;
    periodo_fim: string;
    sentimento: string;
    score_sentimento: number;
    total_mensagens: number;
  }>(
    `SELECT periodo_inicio, periodo_fim, sentimento, score_sentimento, total_mensagens
     FROM whatsapp_grupos_analises
     WHERE grupo_id = $1 AND empresa_id = $2
     ORDER BY criado_em DESC
     LIMIT 10`,
    [id, session.empresaId]
  );

  return NextResponse.json({
    grupo: {
      id: grupo.id,
      nome: grupo.nome,
      total_membros: grupo.total_membros,
    },
    periodo: { desde: desde.toISOString(), ate: ate.toISOString() },
    totais: {
      mensagens: parseInt(totals?.total ?? "0"),
      participantes: parseInt(totals?.participantes ?? "0"),
    },
    por_dia: porDia.map((r) => ({ dia: r.dia, total: parseInt(r.total) })),
    por_tipo: porTipo.map((r) => ({ tipo: r.tipo, total: parseInt(r.total) })),
    top_participantes: topParticipantes.map((r) => ({
      jid: r.jid,
      nome: r.nome,
      total: parseInt(r.total),
    })),
    ultima_analise: ultimaAnalise ?? null,
    historico_sentimento: historicoSentimento.reverse(),
  });
}
