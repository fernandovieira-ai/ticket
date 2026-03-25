import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/whatsapp/analises — lista todas as análises IA de todos os grupos da empresa
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const rows = await query<{
    id: string;
    grupo_id: string;
    grupo_nome: string;
    instancia_nome: string;
    periodo_inicio: string;
    periodo_fim: string;
    total_mensagens: number;
    total_participantes: number;
    resumo: string;
    sentimento: string;
    score_sentimento: number;
    topicos: unknown;
    alertas: unknown;
    criado_em: string;
  }>(
    `SELECT a.id, a.grupo_id, g.nome AS grupo_nome,
            wi.nome_instancia AS instancia_nome,
            a.periodo_inicio, a.periodo_fim,
            a.total_mensagens, a.total_participantes,
            a.resumo, a.sentimento, a.score_sentimento,
            a.topicos, a.alertas, a.criado_em
     FROM whatsapp_grupos_analises a
     JOIN whatsapp_grupos g ON g.id = a.grupo_id
     JOIN whatsapp_instancias wi ON wi.id = g.instancia_id
     WHERE a.empresa_id = $1
     ORDER BY a.criado_em DESC
     LIMIT 100`,
    [session.empresaId]
  );

  return NextResponse.json(rows);
}
