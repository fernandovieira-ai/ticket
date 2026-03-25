import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { Categoria } from '@/types'

const updateSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  descricao: z.string().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  sla_primeira_resp: z.string().nullable().optional(),
  sla_resolucao: z.string().nullable().optional(),
  visivel_cliente: z.boolean().optional(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().optional(),
})

// GET /api/categorias/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const cat = await queryOne<Categoria>(
    `SELECT c.id, c.parent_id, p.nome AS parent_nome,
            ARRAY(
              SELECT d.nome FROM cadegoria_departamento cd
              JOIN departamentos d ON d.id = cd.departamento_id
              WHERE cd.categoria_id = c.id
            ) AS departamentos_nomes,
            c.nome, c.descricao,
            c.sla_primeira_resp::text AS sla_primeira_resp,
            c.sla_resolucao::text AS sla_resolucao,
            c.visivel_cliente, c.ativo, c.ordem, c.criado_em
     FROM categorias c
     LEFT JOIN categorias p ON p.id = c.parent_id
     WHERE c.id = $1`,
    [id]
  )

  if (!cat) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(cat)
}

// PATCH /api/categorias/[id]
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

  // Não permitir que categoria seja seu próprio pai
  if (parsed.data.parent_id === id) {
    return NextResponse.json({ error: 'Uma categoria não pode ser seu próprio pai' }, { status: 400 })
  }

  const { nome, descricao, parent_id, sla_primeira_resp, sla_resolucao, visivel_cliente, ativo, ordem } = parsed.data
  const sets: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (nome !== undefined) { sets.push(`nome = $${idx++}`); values.push(nome) }
  if (descricao !== undefined) { sets.push(`descricao = $${idx++}`); values.push(descricao) }
  if (parent_id !== undefined) { sets.push(`parent_id = $${idx++}`); values.push(parent_id) }
  if (sla_primeira_resp !== undefined) { sets.push(`sla_primeira_resp = $${idx++}::interval`); values.push(sla_primeira_resp || null) }
  if (sla_resolucao !== undefined) { sets.push(`sla_resolucao = $${idx++}::interval`); values.push(sla_resolucao || null) }
  if (visivel_cliente !== undefined) { sets.push(`visivel_cliente = $${idx++}`); values.push(visivel_cliente) }
  if (ativo !== undefined) { sets.push(`ativo = $${idx++}`); values.push(ativo) }
  if (ordem !== undefined) { sets.push(`ordem = $${idx++}`); values.push(ordem) }

  if (sets.length === 0) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })

  values.push(id)
  try {
    const cat = await queryOne<Categoria>(
      `UPDATE categorias SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, parent_id, nome, descricao,
                 sla_primeira_resp::text AS sla_primeira_resp,
                 sla_resolucao::text AS sla_resolucao,
                 visivel_cliente, ativo, ordem, criado_em`,
      values
    )
    if (!cat) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    return NextResponse.json(cat)
  } catch {
    return NextResponse.json({ error: 'Valor de SLA inválido. Use formato como "2 hours", "1 day".' }, { status: 400 })
  }
}

// DELETE /api/categorias/[id]
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

  // Verificar subcategorias filhas
  const filhos = await query(`SELECT id FROM categorias WHERE parent_id = $1 LIMIT 1`, [id])
  if (filhos.length > 0) {
    return NextResponse.json(
      { error: 'Esta categoria possui subcategorias. Remova-as antes de excluir.' },
      { status: 409 }
    )
  }

  await query(`DELETE FROM categorias WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
