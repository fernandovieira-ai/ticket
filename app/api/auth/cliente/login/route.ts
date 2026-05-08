import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { queryOne, query } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/auth'
import type { Usuario } from '@/types'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  connectAuto: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { email, password, connectAuto } = parsed.data
  const ip = req.headers.get('x-forwarded-for') ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  const usuario = await queryOne<Usuario>(
    `SELECT * FROM usuarios WHERE email = $1 AND perfil = 'cliente' LIMIT 1`,
    [email]
  )

  if (!usuario || !usuario.ativo) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
    return NextResponse.json(
      { error: 'Conta bloqueada temporariamente.', code: 'ACCOUNT_LOCKED' },
      { status: 403 }
    )
  }

  const senhaCorreta = usuario.password_hash
    ? await bcrypt.compare(password, usuario.password_hash)
    : false

  if (!senhaCorreta) {
    const tentativas = usuario.tentativas_login + 1
    const bloqueadoAte = tentativas >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null

    // Executar queries de falha em paralelo
    await Promise.all([
      query(
        `UPDATE usuarios SET tentativas_login = $1, bloqueado_ate = $2 WHERE id = $3`,
        [tentativas, bloqueadoAte, usuario.id]
      ),
      query(
        `INSERT INTO log_acessos (usuario_id, ip, user_agent, sucesso) VALUES ($1, $2, $3, false)`,
        [usuario.id, ip, userAgent]
      )
    ])
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  // Executar queries de sucesso em paralelo (não esperar por elas para responder)
  const updateQueries = Promise.all([
    query(
      `UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL, ultimo_acesso = NOW() WHERE id = $1`,
      [usuario.id]
    ),
    query(
      `INSERT INTO log_acessos (usuario_id, ip, user_agent, sucesso) VALUES ($1, $2, $3, true)`,
      [usuario.id, ip, userAgent]
    )
  ])

  // Não aguardar as queries de log para responder mais rápido
  updateQueries.catch(err => console.error('[Login] Erro ao atualizar logs:', err))

  const payload = {
    sub: usuario.id,
    empresaId: usuario.empresa_id,
    perfil: usuario.perfil,
    nome: usuario.nome,
    email: usuario.email,
  }

  const accessToken = await signAccessToken(payload)
  const refreshToken = await signRefreshToken({ sub: usuario.id, empresaId: usuario.empresa_id })

  const response = NextResponse.json({
    user: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
  })

  // Adicionar headers de segurança e performance
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // Definir tempos de vida dos cookies baseado na opção "conectar automatico"
  const accessTokenMaxAge = connectAuto ? 86400 : 900 // 24 horas ou 15 minutos
  const refreshTokenMaxAge = connectAuto ? 2592000 : 604800 // 30 dias ou 7 dias

  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: accessTokenMaxAge
  })
  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: refreshTokenMaxAge
  })

  return response
}
