import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/whatsapp/grupos — lista grupos da empresa
// Query param: com_mensagens=true → retorna apenas grupos que têm ao menos 1 mensagem salva
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const comMensagens = req.nextUrl.searchParams.get("com_mensagens") === "true";

  const rows = await query<{
    id: string;
    instancia_id: string;
    instancia_nome: string;
    group_jid: string;
    nome: string;
    descricao: string | null;
    foto_url: string | null;
    total_membros: number;
    monitorado: boolean;
    ativo: boolean;
    sincronizado_em: string | null;
    criado_em: string;
    ultimo_atendimento: string | null;
    interacoes_abertas: string;
  }>(
    `SELECT g.id, g.instancia_id, wi.nome_instancia AS instancia_nome,
            g.group_jid, g.nome, g.descricao, g.foto_url,
            g.total_membros, g.monitorado, g.ativo,
            g.sincronizado_em, g.criado_em,
            ia.ultimo_atendimento,
            COALESCE(ia.interacoes_abertas, 0) AS interacoes_abertas
     FROM whatsapp_grupos g
     JOIN whatsapp_instancias wi ON wi.id = g.instancia_id
     LEFT JOIN LATERAL (
       SELECT MAX(respondido_em)   AS ultimo_atendimento,
              COUNT(*) FILTER (WHERE respondido_em IS NULL) AS interacoes_abertas
       FROM whatsapp_grupos_interacoes
       WHERE grupo_id = g.id
     ) ia ON true
     WHERE g.empresa_id = $1
       ${comMensagens ? "AND EXISTS (SELECT 1 FROM whatsapp_grupos_mensagens m WHERE m.grupo_id = g.id)" : ""}
     ORDER BY ia.ultimo_atendimento DESC NULLS LAST, g.nome ASC`,
    [session.empresaId]
  );

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      interacoes_abertas: parseInt(r.interacoes_abertas),
    }))
  );
}
