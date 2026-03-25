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
    return NextResponse.json({ error: 'Dados inválidos', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const { email, password, connectAuto } = parsed.data
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  const usuario = await queryOne<Usuario>(
    `SELECT * FROM usuarios WHERE email = $1 AND perfil != 'cliente' LIMIT 1`,
    [email]
  )

  if (!usuario) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  // Verifica bloqueio
  if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
    await registrarLog(usuario.id, ip, userAgent, false)
    return NextResponse.json(
      { error: 'Conta bloqueada temporariamente. Tente novamente mais tarde.', code: 'ACCOUNT_LOCKED' },
      { status: 403 }
    )
  }

  if (!usuario.ativo) {
    return NextResponse.json({ error: 'Usuário inativo', code: 'USER_INACTIVE' }, { status: 403 })
  }

  const senhaCorreta = usuario.password_hash
    ? await bcrypt.compare(password, usuario.password_hash)
    : false

  if (!senhaCorreta) {
    const tentativas = usuario.tentativas_login + 1
    const bloqueadoAte = tentativas >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null

    await query(
      `UPDATE usuarios SET tentativas_login = $1, bloqueado_ate = $2 WHERE id = $3`,
      [tentativas, bloqueadoAte, usuario.id]
    )
    await registrarLog(usuario.id, ip, userAgent, false)

    if (tentativas >= 5) {
      return NextResponse.json(
        { error: 'Conta bloqueada por 15 minutos após 5 tentativas.', code: 'ACCOUNT_LOCKED' },
        { status: 403 }
      )
    }

    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  // Login bem-sucedido — resetar tentativas
  await query(
    `UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL, ultimo_acesso = NOW() WHERE id = $1`,
    [usuario.id]
  )
  await registrarLog(usuario.id, ip, userAgent, true)

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
    user: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      avatar_url: usuario.avatar_url,
    },
  })

  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 900,
  })
  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: connectAuto ? 2592000 : 604800, // 30 dias ou 7 dias
  })

  return response
}

async function registrarLog(
  usuarioId: string,
  ip: string | null,
  userAgent: string | null,
  sucesso: boolean
) {
  await query(
    `INSERT INTO log_acessos (usuario_id, ip, user_agent, sucesso) VALUES ($1, $2, $3, $4)`,
    [usuarioId, ip, userAgent, sucesso]
  )
}
