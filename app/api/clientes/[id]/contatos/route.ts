import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { ContatoCliente } from '@/types'

const contatoSchema = z.object({
  nome: z.string().min(2).max(150),
  cargo: z.string().max(100).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
  principal: z.boolean().optional().default(false),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params

  // Verificar que o cliente pertence à empresa
  const cliente = await queryOne(
    `SELECT id FROM clientes WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  )
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = contatoSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const { nome, cargo, email, telefone, principal } = parsed.data

  // Se principal, desmarcar os outros
  if (principal) {
    await query(`UPDATE contatos_cliente SET principal = false WHERE cliente_id = $1`, [id])
  }

  const [contato] = await query<ContatoCliente>(
    `INSERT INTO contatos_cliente (cliente_id, nome, cargo, email, telefone, principal)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, nome, cargo ?? null, email ?? null, telefone ?? null, principal]
  )

  return NextResponse.json(contato, { status: 201 })
}
