import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SignJWT } from 'jose'
import { queryOne } from '@/lib/db'
import { emailRecuperacaoSenha } from '@/lib/email/send'
import type { Usuario } from '@/types'

const schema = z.object({
  email: z.string().email(),
})

const PERFIS_OPERADOR = ['operador', 'admin', 'supervisor']

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)
function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })

  const { email } = parsed.data

  // Buscar qualquer usuário ativo com esse e-mail para detectar painel errado
  const usuario = await queryOne<Pick<Usuario, 'id' | 'nome' | 'email' | 'empresa_id' | 'perfil'>>(
    `SELECT id, nome, email, empresa_id, perfil FROM usuarios WHERE email = $1 AND ativo = true LIMIT 1`,
    [email.toLowerCase()],
  )

  if (usuario && !PERFIS_OPERADOR.includes(usuario.perfil)) {
    // E-mail existe mas pertence a um cliente — informar painel correto
    return NextResponse.json(
      { error: 'Este e-mail pertence a uma conta de cliente. Use o portal do cliente para recuperar sua senha.' },
      { status: 400 },
    )
  }

  if (!usuario) {
    console.log('[recuperar-senha/operador] usuario nao encontrado para email:', email.toLowerCase())
  }

  if (usuario) {
    const token = await new SignJWT({ sub: usuario.id, type: 'password_reset' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(JWT_SECRET)

    const urlRedefinir = `${getBaseUrl(req)}/redefinir-senha?token=${token}`

    const resultado = await emailRecuperacaoSenha({
      emailCliente: usuario.email,
      nomeCliente: usuario.nome,
      urlRedefinir,
    })

    console.log('[recuperar-senha/operador] resultado Resend:', JSON.stringify(resultado))

    if ('error' in resultado && resultado.error) {
      console.error('[recuperar-senha/operador] erro Resend:', resultado.error)
      return NextResponse.json(
        { error: `Falha ao enviar e-mail: ${(resultado.error as { message?: string }).message ?? JSON.stringify(resultado.error)}` },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ ok: true })
}
