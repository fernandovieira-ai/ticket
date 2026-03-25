import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { verifyRefreshToken, signAccessToken, signRefreshToken } from '@/lib/auth'
import type { Usuario } from '@/types'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value
  if (!refreshToken) {
    return NextResponse.json({ error: 'Token não encontrado' }, { status: 401 })
  }

  const decoded = await verifyRefreshToken(refreshToken)
  if (!decoded) {
    return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 })
  }

  const usuario = await queryOne<Usuario>(
    `SELECT * FROM usuarios WHERE id = $1 AND ativo = true LIMIT 1`,
    [decoded.sub]
  )

  if (!usuario) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 401 })
  }

  const payload = {
    sub: usuario.id,
    empresaId: usuario.empresa_id,
    perfil: usuario.perfil,
    nome: usuario.nome,
    email: usuario.email,
  }

  const newAccessToken = await signAccessToken(payload)
  const newRefreshToken = await signRefreshToken({ sub: usuario.id, empresaId: usuario.empresa_id })

  const response = NextResponse.json({ ok: true })
  response.cookies.set('access_token', newAccessToken, { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 900 })
  response.cookies.set('refresh_token', newRefreshToken, { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 604800 })
  return response
}
