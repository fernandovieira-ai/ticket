import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/solicitacao-tipos
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const tipos = await query<{
    id: string;
    codigo: string;
    nome: string;
    descricao: string | null;
    icone: string | null;
    cor: string;
    ordem: number;
  }>(
    `SELECT id, codigo, nome, descricao, icone, cor, ordem
     FROM solicitacao_tipos
     WHERE (empresa_id = $1 OR empresa_id IS NULL) AND ativo = true
     ORDER BY ordem, nome`,
    [session.empresaId],
  );

  const res = NextResponse.json(tipos);
  res.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
  return res;
}
