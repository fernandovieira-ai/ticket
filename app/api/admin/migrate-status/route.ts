import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/admin/migrate-status
// Rota temporária para migrar status: transforma 'Resolvido' em 'Finalizado' e desativa 'Fechado'
// Apagar este arquivo após executar uma vez.
export async function GET() {
  const session = await getSession();
  if (!session || session.perfil !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // 1. Atualiza 'resolvido' para 'Finalizado' com encerra=TRUE e cor cinza do fechado
  await query(`
    UPDATE ticket_status
    SET nome            = 'Finalizado',
        codigo          = 'finalizado',
        cor             = '#6B7280',
        encerra         = TRUE,
        permite_reabrir = TRUE,
        descricao       = 'Chamado finalizado pelo atendente'
    WHERE codigo = 'resolvido' AND empresa_id IS NULL
  `);

  // 2. Migra tickets que estavam com status 'fechado' para 'finalizado'
  await query(`
    UPDATE tickets t
    SET status_id = (
      SELECT id FROM ticket_status WHERE codigo = 'finalizado' AND empresa_id IS NULL
    )
    WHERE t.status_id = (
      SELECT id FROM ticket_status WHERE codigo = 'fechado' AND empresa_id IS NULL
    )
  `);

  // 3. Desativa 'fechado'
  await query(`
    UPDATE ticket_status
    SET ativo = FALSE
    WHERE codigo = 'fechado' AND empresa_id IS NULL
  `);

  return NextResponse.json({ ok: true, mensagem: "Migração concluída. Apague o arquivo app/api/admin/migrate-status/route.ts" });
}
