import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { classificarTicket } from "@/lib/ia";
import type { Categoria } from "@/types";

const schema = z.object({
  titulo: z.string().min(3).max(300),
  descricao: z.string().min(1),
  ticket_id: z.string().uuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );

  // Carrega categorias da empresa para contexto da classificação
  const categorias = await query<Categoria>(
    `SELECT id, nome, descricao, ativo, parent_id, sla_primeira_resp, sla_resolucao,
            visivel_cliente, ordem, criado_em
     FROM categorias
     WHERE empresa_id = $1 AND ativo = TRUE AND parent_id IS NULL
     ORDER BY ordem, nome`,
    [session.empresaId],
  );

  try {
    const resultado = await classificarTicket(
      parsed.data.titulo,
      parsed.data.descricao,
      categorias,
      session.empresaId,
      session.sub,
      parsed.data.ticket_id ?? null,
    );
    return NextResponse.json(resultado);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Erro ao classificar ticket";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
