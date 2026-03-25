import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/subcategorias/[id]/categorias
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const rows = await query<{ categoria_id: string; nome: string; descricao: string | null }>(
    `SELECT cs.categoria_id, c.nome, c.descricao
     FROM cadegoria_subcategoria cs
     JOIN categorias c ON c.id = cs.categoria_id
     WHERE cs.subcategoria_id = $1
     ORDER BY c.nome`,
    [id]
  )
  return NextResponse.json(rows)
}

// POST /api/subcategorias/[id]/categorias
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
  let body: { categoria_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { categoria_id } = body
  if (!categoria_id) {
    return NextResponse.json({ error: 'categoria_id é obrigatório' }, { status: 400 })
  }

  const existe = await query(
    `SELECT 1 FROM cadegoria_subcategoria WHERE subcategoria_id = $1 AND categoria_id = $2`,
    [id, categoria_id]
  )
  if (existe.length > 0) {
    return NextResponse.json({ error: 'Categoria já vinculada' }, { status: 409 })
  }

  await query(
    `INSERT INTO cadegoria_subcategoria (id, subcategoria_id, categoria_id)
     VALUES (gen_random_uuid(), $1, $2)`,
    [id, categoria_id]
  )
  return NextResponse.json({ ok: true }, { status: 201 })
}

// DELETE /api/subcategorias/[id]/categorias  (body: { categoria_id })
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(session.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  let body: { categoria_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { categoria_id } = body
  if (!categoria_id) {
    return NextResponse.json({ error: 'categoria_id é obrigatório' }, { status: 400 })
  }

  await query(
    `DELETE FROM cadegoria_subcategoria WHERE subcategoria_id = $1 AND categoria_id = $2`,
    [id, categoria_id]
  )
  return NextResponse.json({ ok: true })
}
