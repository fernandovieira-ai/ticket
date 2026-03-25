import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { resumirTicket } from "@/lib/ia";

const schema = z.object({
  ticket_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["admin", "supervisor", "operador"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "ticket_id inválido" }, { status: 400 });

  try {
    const resumo = await resumirTicket(
      parsed.data.ticket_id,
      session.empresaId,
      session.sub,
    );
    return NextResponse.json({ resumo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao gerar resumo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
