import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/whatsapp/grupos/resumo-stats
// Retorna total de mensagens e última análise para todos os grupos monitorados da empresa.
// Substitui N chamadas individuais a /stats na listagem de grupos.
// Query params: desde (ISO), ate (ISO) — padrão: início do dia de hoje até agora
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sp  = req.nextUrl.searchParams;
  const ate   = sp.get("ate")   ? new Date(sp.get("ate")!)   : new Date();
  const desde = sp.get("desde") ? new Date(sp.get("desde")!) : (() => {
    const d = new Date(ate);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  // 1. Total de mensagens por grupo monitorado no período (1 query para todos)
  const totalMensagens = await query<{ grupo_id: string; total: string }>(
    `SELECT m.grupo_id, COUNT(*) AS total
     FROM whatsapp_grupos_mensagens m
     JOIN whatsapp_grupos g ON g.id = m.grupo_id
     WHERE g.empresa_id = $1
       AND g.monitorado = true
       AND m.criado_em >= $2
       AND m.criado_em <= $3
     GROUP BY m.grupo_id`,
    [session.empresaId, desde, ate]
  );

  // 2. Última análise por grupo monitorado (1 query para todos)
  const ultimasAnalises = await query<{
    grupo_id: string;
    sentimento: string;
    criado_em: string;
  }>(
    `SELECT DISTINCT ON (a.grupo_id) a.grupo_id, a.sentimento, a.criado_em
     FROM whatsapp_grupos_analises a
     JOIN whatsapp_grupos g ON g.id = a.grupo_id
     WHERE g.empresa_id = $1
       AND g.monitorado = true
     ORDER BY a.grupo_id, a.criado_em DESC`,
    [session.empresaId]
  );

  // Monta mapa grupo_id → dados
  const resultado: Record<string, {
    total_mensagens: number;
    ultimo_sentimento: string | null;
    ultima_analise: string | null;
  }> = {};

  for (const row of totalMensagens) {
    resultado[row.grupo_id] = {
      total_mensagens: parseInt(row.total),
      ultimo_sentimento: null,
      ultima_analise: null,
    };
  }

  for (const row of ultimasAnalises) {
    if (!resultado[row.grupo_id]) {
      resultado[row.grupo_id] = { total_mensagens: 0, ultimo_sentimento: null, ultima_analise: null };
    }
    resultado[row.grupo_id].ultimo_sentimento = row.sentimento;
    resultado[row.grupo_id].ultima_analise    = row.criado_em;
  }

  return NextResponse.json(resultado);
}
