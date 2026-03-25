import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/categorias/[id]/departamentos
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const rows = await query<{ departamento_id: string; nome: string; descricao: string | null }>(
    `SELECT cd.departamento_id, d.nome, d.descricao
     FROM cadegoria_departamento cd
     JOIN departamentos d ON d.id = cd.departamento_id
     WHERE cd.categoria_id = $1
     ORDER BY d.nome`,
    [id]
  )
  return NextResponse.json(rows)
}

// POST /api/categorias/[id]/departamentos
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
  let body: { departamento_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { departamento_id } = body
  if (!departamento_id) {
    return NextResponse.json({ error: 'departamento_id é obrigatório' }, { status: 400 })
  }

  // Verificar se já está vinculado
  const existe = await query(
    `SELECT 1 FROM cadegoria_departamento WHERE categoria_id = $1 AND departamento_id = $2`,
    [id, departamento_id]
  )
  if (existe.length > 0) {
    return NextResponse.json({ error: 'Departamento já vinculado' }, { status: 409 })
  }

  await query(
    `INSERT INTO cadegoria_departamento (id, categoria_id, departamento_id)
     VALUES (gen_random_uuid(), $1, $2)`,
    [id, departamento_id]
  )
  return NextResponse.json({ ok: true }, { status: 201 })
}

// DELETE /api/categorias/[id]/departamentos  (body: { departamento_id })
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
  let body: { departamento_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { departamento_id } = body
  if (!departamento_id) {
    return NextResponse.json({ error: 'departamento_id é obrigatório' }, { status: 400 })
  }

  await query(
    `DELETE FROM cadegoria_departamento WHERE categoria_id = $1 AND departamento_id = $2`,
    [id, departamento_id]
  )
  return NextResponse.json({ ok: true })
}
