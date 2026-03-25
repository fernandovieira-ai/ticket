import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { Cliente } from '@/types'

// GET /api/usuarios/[id]/clientes
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params

  const clientes = await query<Cliente>(
    `SELECT c.id, c.nome_razao, c.tipo, c.documento, c.email, c.telefone, c.ativo
     FROM clientes c
     INNER JOIN usuario_clientes uc ON uc.cliente_id = c.id
     WHERE uc.usuario_id = $1
     ORDER BY c.nome_razao`,
    [id]
  )

  return NextResponse.json(clientes)
}

// POST /api/usuarios/[id]/clientes
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(session.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = z.object({ cliente_id: z.string().uuid() }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'cliente_id inválido' }, { status: 400 })
  }

  await query(
    `INSERT INTO usuario_clientes (usuario_id, cliente_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [id, parsed.data.cliente_id]
  )

  return NextResponse.json({ ok: true }, { status: 201 })
}
