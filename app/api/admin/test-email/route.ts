import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { emailAberturaTicket } from "@/lib/email/send";

// GET /api/admin/test-email — dispara email de teste (somente admin)
export async function GET() {
  const session = await getSession();
  if (!session || session.perfil !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const result = await emailAberturaTicket({
      emailCliente: "fernando.vieira@digitalrf.com.br",
      nomeCliente: "Fernando Vieira",
      ticketId: "00000000-0000-0000-0000-000000000001",
      numeroTicket: "000001",
      titulo: "Teste de email — DigitalRF Help",
      descricao:
        "Este é um email de teste para verificar se o envio via Resend está funcionando corretamente.",
      prioridade: "Normal",
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[test-email]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
