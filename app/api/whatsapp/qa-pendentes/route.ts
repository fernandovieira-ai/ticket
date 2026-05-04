import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/whatsapp/qa-pendentes
// Lista Q&A aguardando aprovação
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") ?? "pendente";

  const rows = await query<{
    id: string;
    categoria_sugerida: string | null;
    pergunta_original: string;
    resposta_original: string;
    pergunta_editada: string | null;
    resposta_editada: string | null;
    grupo_id: string;
    confianca_extracao: string;
    status: string;
    revisado_por: string | null;
    revisado_at: string | null;
    motivo_rejeicao: string | null;
    qa_base_id: string | null;
    criado_at: string;
  }>(
    `SELECT id,
            limpar_latin1(categoria_sugerida)::TEXT  AS categoria_sugerida,
            limpar_latin1(pergunta_original)::TEXT   AS pergunta_original,
            limpar_latin1(resposta_original)::TEXT   AS resposta_original,
            limpar_latin1(pergunta_editada)::TEXT    AS pergunta_editada,
            limpar_latin1(resposta_editada)::TEXT    AS resposta_editada,
            grupo_id, confianca_extracao, status,
            revisado_por, revisado_at, motivo_rejeicao, qa_base_id, criado_at
     FROM grupos_qa_pendentes
     WHERE status = $1
     ORDER BY criado_at DESC`,
    [status],
  );

  return NextResponse.json(rows);
}
