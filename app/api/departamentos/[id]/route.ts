import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { Departamento } from '@/types'

const updateSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  descricao: z.string().max(500).nullable().optional(),
  ativo: z.boolean().optional(),
})

// GET /api/departamentos/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const departamento = await queryOne<Departamento>(
    `SELECT id, nome, descricao, ativo, criado_em
     FROM departamentos WHERE id = $1`,
    [id]
  )

  if (!departamento) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(departamento)
}

// PATCH /api/departamentos/[id]
export async function PATCH(
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

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { nome, descricao, ativo } = parsed.data
  const sets: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (nome !== undefined) { sets.push(`nome = $${idx++}`); values.push(nome) }
  if (descricao !== undefined) { sets.push(`descricao = $${idx++}`); values.push(descricao) }
  if (ativo !== undefined) { sets.push(`ativo = $${idx++}`); values.push(ativo) }

  if (sets.length === 0) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })

  values.push(id)
  const [departamento] = await query<Departamento>(
    `UPDATE departamentos SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING id, nome, descricao, ativo, criado_em`,
    values
  )

  if (!departamento) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(departamento)
}

// DELETE /api/departamentos/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.perfil !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params

  const vinculado = await queryOne(
    `SELECT id FROM usuarios WHERE departamento_id = $1 LIMIT 1`,
    [id]
  )
  if (vinculado) {
    return NextResponse.json(
      { error: 'Departamento possui usuários vinculados. Desvincule-os antes de excluir.' },
      { status: 409 }
    )
  }

  await query(`DELETE FROM departamentos WHERE id = $1`, [id])

  return NextResponse.json({ ok: true })
}
