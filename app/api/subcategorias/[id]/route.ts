import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { Subcategoria } from '@/types'

const updateSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  descricao: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
})

// GET /api/subcategorias/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const sub = await queryOne<Subcategoria>(
    `SELECT s.id, s.empresa_id, s.nome, s.descricao, s.ativo, s.criado_em,
            ARRAY(
              SELECT c.nome FROM cadegoria_subcategoria cs
              JOIN categorias c ON c.id = cs.categoria_id
              WHERE cs.subcategoria_id = s.id
            ) AS categorias_nomes
     FROM subcategorias s
     WHERE s.id = $1 AND s.empresa_id = $2`,
    [id, session.empresaId]
  )

  if (!sub) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(sub)
}

// PATCH /api/subcategorias/[id]
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

  values.push(id, session.empresaId)
  const sub = await queryOne<Subcategoria>(
    `UPDATE subcategorias SET ${sets.join(', ')} WHERE id = $${idx} AND empresa_id = $${idx + 1}
     RETURNING id, empresa_id, nome, descricao, ativo, criado_em`,
    values
  )
  if (!sub) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(sub)
}

// DELETE /api/subcategorias/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(session.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  await query(`DELETE FROM subcategorias WHERE id = $1 AND empresa_id = $2`, [id, session.empresaId])
  return NextResponse.json({ ok: true })
}
