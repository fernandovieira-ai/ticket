import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import pool, { queryOne } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/auth'
import type { Usuario, Cliente } from '@/types'

const cadastroSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(150),
  email: z.string().email('E-mail inválido').max(200),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  telefone: z.string().max(20).optional().nullable(),
  filial: z.string().max(100).optional().nullable(),
  grupoWhatsapp: z.string().max(150).optional().nullable(),
  cnpj: z.string().max(18).optional().nullable(),
})

// Busca empresa_id: usa EMPRESA_ID do env ou pega a primeira empresa do banco
async function resolveEmpresaId(client: Awaited<ReturnType<typeof pool.connect>>): Promise<string | null> {
  if (process.env.EMPRESA_ID) return process.env.EMPRESA_ID

  const res = await client.query(`SELECT id FROM empresas ORDER BY criado_em LIMIT 1`)
  return res.rows[0]?.id ?? null
}

// Busca dados do CNPJ na BrasilAPI (server-side)
async function buscarDadosCnpj(cnpj: string): Promise<Record<string, string> | null> {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return null

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: { 'User-Agent': 'digitalrf-help/1.0', Accept: 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = cadastroSchema.safeParse(body)
  if (!parsed.success) {
    // Retorna a primeira mensagem de erro em português
    const firstError = parsed.error.errors[0]
    const fieldLabels: Record<string, string> = {
      nome: 'Nome',
      email: 'E-mail',
      password: 'Senha',
      telefone: 'Telefone',
      cnpj: 'CNPJ',
    }
    const campo = fieldLabels[firstError.path[0] as string] ?? String(firstError.path[0])
    const msg = firstError.message.includes('Required')
      ? `${campo} é obrigatório`
      : firstError.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { nome, email, password, telefone, cnpj } = parsed.data
  const cnpjDigits = cnpj ? cnpj.replace(/\D/g, '') : ''

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── 1. Determinar empresa ──────────────────────────────────────────────
    const empresaId = await resolveEmpresaId(client)
    if (!empresaId) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Sistema não configurado.' }, { status: 500 })
    }

    // ── 2. Verificar e-mail duplicado ──────────────────────────────────────
    const emailExiste = await client.query(
      `SELECT id FROM usuarios WHERE empresa_id = $1 AND email = $2 LIMIT 1`,
      [empresaId, email.toLowerCase()],
    )
    if (emailExiste.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
    }

    // ── 3. Criar usuário ───────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12)
    const teleSoDigitos = telefone ? telefone.replace(/\D/g, '').slice(0, 11) : null

    const usuarioRes = await client.query<Usuario>(
      `INSERT INTO usuarios (empresa_id, nome, email, password_hash, perfil, telefone)
       VALUES ($1, $2, $3, $4, 'cliente', $5)
       RETURNING *`,
      [empresaId, nome, email.toLowerCase(), passwordHash, teleSoDigitos],
    )
    const usuario = usuarioRes.rows[0]

    // ── 4. Resolver cliente ────────────────────────────────────────────────
    let clienteId: string

    if (cnpjDigits.length === 14) {
      // Verificar se já existe cliente com este CNPJ na empresa
      const clienteExistente = await client.query<Cliente>(
        `SELECT id FROM clientes WHERE empresa_id = $1 AND documento = $2 LIMIT 1`,
        [empresaId, cnpjDigits],
      )

      if (clienteExistente.rows.length > 0) {
        // CNPJ já cadastrado — apenas vincula
        clienteId = clienteExistente.rows[0].id
      } else {
        // CNPJ não cadastrado — busca na BrasilAPI e cria o cliente
        const dadosCnpj = await buscarDadosCnpj(cnpjDigits)

        const nomeRazao = dadosCnpj?.razao_social ?? nome
        const emailCliente = dadosCnpj?.email ?? email
        const telefoneCliente = dadosCnpj?.ddd_telefone_1
          ? (dadosCnpj.ddd_telefone_1).replace(/\D/g, '').slice(0, 30)
          : (telefone ?? null)
        const cep = dadosCnpj?.cep?.replace(/\D/g, '') ?? null
        const logradouro = dadosCnpj?.logradouro ?? null
        const numero = dadosCnpj?.numero ?? null
        const complemento = dadosCnpj?.complemento ?? null
        const bairro = dadosCnpj?.bairro ?? null
        const cidade = dadosCnpj?.municipio ?? null
        const uf = dadosCnpj?.uf ?? null

        const novoClienteRes = await client.query<Cliente>(
          `INSERT INTO clientes
             (empresa_id, nome_razao, tipo, documento, email, telefone,
              cep, logradouro, numero, complemento, bairro, cidade, uf)
           VALUES ($1, $2, 'J', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [
            empresaId, nomeRazao, cnpjDigits,
            emailCliente, telefoneCliente,
            cep, logradouro, numero, complemento, bairro, cidade, uf,
          ],
        )
        clienteId = novoClienteRes.rows[0].id
      }
    } else {
      // Sem CNPJ — cria cliente como pré-cadastro para acertar depois
      const novoClienteRes = await client.query<Cliente>(
        `INSERT INTO clientes
           (empresa_id, nome_razao, tipo, email, telefone, ind_pre_cadastro)
         VALUES ($1, $2, 'F', $3, $4, true)
         RETURNING *`,
        [empresaId, nome, email.toLowerCase(), teleSoDigitos],
      )
      clienteId = novoClienteRes.rows[0].id
    }

    // ── 5. Vincular usuário ↔ cliente ─────────────────────────────────────
    await client.query(
      `INSERT INTO usuario_clientes (usuario_id, cliente_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [usuario.id, clienteId],
    )

    await client.query('COMMIT')

    // ── 6. Gerar tokens e retornar sessão ─────────────────────────────────
    const payload = {
      sub: usuario.id,
      empresaId: usuario.empresa_id,
      perfil: usuario.perfil,
      nome: usuario.nome,
      email: usuario.email,
    }

    const accessToken = await signAccessToken(payload)
    const refreshToken = await signRefreshToken({ sub: usuario.id, empresaId: usuario.empresa_id })

    const response = NextResponse.json(
      { user: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil } },
      { status: 201 },
    )

    response.cookies.set('access_token', accessToken, { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 900 })
    response.cookies.set('refresh_token', refreshToken, { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 604800 })

    return response
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/auth/cliente/cadastro]', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    client.release()
  }
}
