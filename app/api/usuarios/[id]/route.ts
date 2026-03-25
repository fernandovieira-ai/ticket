import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { query, queryOne } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { UsuarioSemSenha } from '@/types'

const updateSchema = z.object({
  nome: z.string().min(2).max(150).optional(),
  perfil: z.enum(['admin', 'supervisor', 'operador', 'somente_leitura', 'cliente']).optional(),
  departamento_id: z.string().uuid().nullable().optional(),
  telefone: z.string().max(30).nullable().optional(),
  whatsapp_jid: z.string().max(100).nullable().optional(),
  ativo: z.boolean().optional(),
  password: z.string().min(6).optional(),
})

// GET /api/usuarios/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const usuario = await queryOne<UsuarioSemSenha>(
    `SELECT id, empresa_id, departamento_id, nome, email, perfil, avatar_url, telefone, whatsapp_jid, ativo, ultimo_acesso, criado_em, atualizado_em
     FROM usuarios WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  )

  if (!usuario) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(usuario)
}

// PATCH /api/usuarios/[id]
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

  const { nome, perfil, departamento_id, telefone, whatsapp_jid, ativo, password } = parsed.data
  const sets: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (nome !== undefined) { sets.push(`nome = $${idx++}`); values.push(nome) }
  if (perfil !== undefined) { sets.push(`perfil = $${idx++}`); values.push(perfil) }
  if (departamento_id !== undefined) { sets.push(`departamento_id = $${idx++}`); values.push(departamento_id) }
  if (telefone !== undefined) { sets.push(`telefone = $${idx++}`); values.push(telefone) }
  if (whatsapp_jid !== undefined && session.perfil === 'admin') { sets.push(`whatsapp_jid = $${idx++}`); values.push(whatsapp_jid) }
  if (ativo !== undefined) { sets.push(`ativo = $${idx++}`); values.push(ativo) }
  if (password) {
    const hash = await bcrypt.hash(password, 12)
    sets.push(`password_hash = $${idx++}`)
    values.push(hash)
  }

  if (sets.length === 0) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })

  values.push(id, session.empresaId)
  const [usuario] = await query<UsuarioSemSenha>(
    `UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${idx} AND empresa_id = $${idx + 1}
     RETURNING id, empresa_id, departamento_id, nome, email, perfil, avatar_url, telefone, whatsapp_jid, ativo, ultimo_acesso, criado_em, atualizado_em`,
    values
  )

  if (!usuario) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(usuario)
}

// DELETE /api/usuarios/[id] — desativar (soft delete)
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

  if (id === session.sub) {
    return NextResponse.json({ error: 'Não é possível desativar a própria conta' }, { status: 400 })
  }

  await query(
    `UPDATE usuarios SET ativo = false WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  )

  return NextResponse.json({ ok: true })
}
