import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { query, queryOne } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { UsuarioSemSenha } from '@/types'

const criarUsuarioSchema = z.object({
  nome: z.string().min(2).max(150),
  email: z.string().email().max(200),
  perfil: z.enum(['admin', 'supervisor', 'operador', 'somente_leitura', 'cliente']),
  departamento_id: z.string().uuid().optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
  password: z.string().min(6).optional(),
})

// GET /api/usuarios — lista usuários da empresa
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const busca = searchParams.get('q') ?? ''
  const perfilFiltro = searchParams.get('perfil') ?? ''
  const pagina = Math.max(1, Number(searchParams.get('page') ?? 1))
  const tamanho = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') ?? 20)))
  const offset = (pagina - 1) * tamanho

  const rows = await query<UsuarioSemSenha & { total_count: number }>(
    `SELECT
       u.id, u.empresa_id, u.departamento_id, u.nome, u.email, u.perfil,
       u.avatar_url, u.telefone, u.whatsapp_jid, u.ativo, u.ultimo_acesso, u.criado_em, u.atualizado_em,
       d.nome AS departamento_nome,
       COUNT(*) OVER() AS total_count
     FROM usuarios u
     LEFT JOIN departamentos d ON d.id = u.departamento_id
     WHERE u.empresa_id = $1
       AND ($2 = '' OR u.nome ILIKE $2 OR u.email ILIKE $2)
       AND ($3 = '' OR u.perfil = $3::perfil_usuario)
     ORDER BY u.nome
     LIMIT $4 OFFSET $5`,
    [session.empresaId, busca ? `%${busca}%` : '', perfilFiltro, tamanho, offset]
  )

  return NextResponse.json({
    data: rows,
    total: rows[0]?.total_count ?? 0,
    page: pagina,
    pageSize: tamanho,
  })
}

// POST /api/usuarios — criar usuário
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(session.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = criarUsuarioSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const { nome, email, perfil, departamento_id, telefone, password } = parsed.data

  // Checar e-mail duplicado
  const existente = await queryOne(
    `SELECT id FROM usuarios WHERE empresa_id = $1 AND email = $2`,
    [session.empresaId, email]
  )
  if (existente) {
    return NextResponse.json({ error: 'E-mail já cadastrado', code: 'EMAIL_DUPLICADO' }, { status: 409 })
  }

  const passwordHash = password ? await bcrypt.hash(password, 12) : null

  const [usuario] = await query<UsuarioSemSenha>(
    `INSERT INTO usuarios (empresa_id, nome, email, perfil, departamento_id, telefone, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, empresa_id, departamento_id, nome, email, perfil, avatar_url, telefone, ativo, ultimo_acesso, criado_em, atualizado_em`,
    [session.empresaId, nome, email, perfil, departamento_id ?? null, telefone ?? null, passwordHash]
  )

  return NextResponse.json(usuario, { status: 201 })
}
