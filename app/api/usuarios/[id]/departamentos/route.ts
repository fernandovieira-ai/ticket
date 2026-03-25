import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { Departamento } from '@/types'

// GET /api/usuarios/[id]/departamentos — lista departamentos do usuário
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params

  const departamentos = await query<Departamento>(
    `SELECT d.id, d.nome, d.descricao, d.ativo, d.criado_em
     FROM departamentos d
     INNER JOIN usuario_departamentos ud ON ud.departamento_id = d.id
     WHERE ud.usuario_id = $1
     ORDER BY d.nome`,
    [id]
  )

  return NextResponse.json(departamentos)
}

// POST /api/usuarios/[id]/departamentos — vincular departamento
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

  const parsed = z.object({ departamento_id: z.string().uuid() }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'departamento_id inválido' }, { status: 400 })
  }

  await query(
    `INSERT INTO usuario_departamentos (usuario_id, departamento_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [id, parsed.data.departamento_id]
  )

  return NextResponse.json({ ok: true }, { status: 201 })
}
