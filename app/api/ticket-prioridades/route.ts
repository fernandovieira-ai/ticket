import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const prioridades = await query<{
    id: string;
    nome: string;
    cor: string;
    ordem: number;
  }>(
    `SELECT id, nome, cor, ordem
     FROM ticket_prioridades
     WHERE (empresa_id = $1 OR empresa_id IS NULL) AND ativo = true
     ORDER BY ordem`,
    [session.empresaId],
  );

  return NextResponse.json(prioridades, {
    headers: {
      "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
    },
  });
}
