import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const status = await query<{
    id: string;
    codigo: string;
    nome: string;
    cor: string;
    ordem: number;
    encerra: boolean;
  }>(
    `SELECT id, codigo, nome, cor, ordem, encerra
     FROM ticket_status
     WHERE (empresa_id = $1 OR empresa_id IS NULL) AND ativo = true
     ORDER BY ordem`,
    [session.empresaId],
  );

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
    },
  });
}
