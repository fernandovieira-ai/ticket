import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

// DELETE /api/usuarios/[id]/clientes/[clienteId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; clienteId: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(session.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id, clienteId } = await params

  await query(
    `DELETE FROM usuario_clientes WHERE usuario_id = $1 AND cliente_id = $2`,
    [id, clienteId]
  )

  return NextResponse.json({ ok: true })
}
