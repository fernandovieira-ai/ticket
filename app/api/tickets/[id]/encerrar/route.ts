import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/tickets/[id]/encerrar — cliente encerra o próprio chamado
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.perfil !== "cliente")
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  // Verificar ticket e status atual
  const ticket = await queryOne<{
    id: string;
    cliente_id: string | null;
    status_encerra: boolean;
    sla_resolucao_deadline: Date | null;
  }>(
    `SELECT t.id, t.cliente_id, ts.encerra AS status_encerra, t.sla_resolucao_deadline
     FROM tickets t
     JOIN ticket_status ts ON ts.id = t.status_id
     WHERE t.id = $1 AND t.empresa_id = $2`,
    [id, session.empresaId],
  );

  if (!ticket)
    return NextResponse.json(
      { error: "Ticket não encontrado" },
      { status: 404 },
    );

  if (ticket.status_encerra)
    return NextResponse.json(
      { error: "Chamado já encerrado" },
      { status: 400 },
    );

  // Verificar vínculo do cliente (igual às demais rotas)
  const cli = await queryOne<{ id: string }>(
    `SELECT c.id FROM clientes c
     JOIN usuario_clientes uc ON uc.cliente_id = c.id
     WHERE uc.usuario_id = $1
       AND c.empresa_id = $2
     LIMIT 1`,
    [session.sub, session.empresaId],
  );

  if (!cli || cli.id !== ticket.cliente_id)
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  // Buscar status "finalizado" da empresa
  const statusFinalizado = await queryOne<{ id: string }>(
    `SELECT id FROM ticket_status
     WHERE (empresa_id = $1 OR empresa_id IS NULL)
       AND codigo = 'finalizado'
       AND ativo = true
     ORDER BY empresa_id NULLS LAST LIMIT 1`,
    [session.empresaId],
  );

  if (!statusFinalizado)
    return NextResponse.json(
      { error: "Status finalizado não configurado" },
      { status: 500 },
    );

  await query(
    `UPDATE tickets
     SET status_id = $1, fechado_em = now(), atualizado_em = now()
     WHERE id = $2`,
    [statusFinalizado.id, id],
  );

  // Registrar evento de SLA: cliente encerrou o chamado
  const deadline = ticket.sla_resolucao_deadline;
  const violado = deadline ? new Date() > new Date(deadline) : false;
  await query(
    `INSERT INTO sla_logs (ticket_id, evento, tipo, deadline, violado)
     VALUES ($1, 'cliente_fechou', 'resolucao', $2, $3)`,
    [id, deadline, violado],
  );

  return NextResponse.json({ ok: true });
}
