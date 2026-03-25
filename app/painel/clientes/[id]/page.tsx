import { notFound } from 'next/navigation'
import { queryOne, query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { Cliente, ContatoCliente } from '@/types'
import { FichaClienteClient } from './ficha-cliente-client'

interface ClienteComContatos extends Cliente {
  contatos: ContatoCliente[]
}

export default async function FichaClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) return null

  const { id } = await params

  const [cliente, contatos] = await Promise.all([
    queryOne<Cliente>(
      `SELECT * FROM clientes WHERE id = $1 AND empresa_id = $2`,
      [id, session.empresaId]
    ),
    query<ContatoCliente>(
      `SELECT * FROM contatos_cliente WHERE cliente_id = $1 ORDER BY principal DESC, nome`,
      [id]
    ),
  ])

  if (!cliente) notFound()

  return <FichaClienteClient cliente={{ ...cliente, contatos }} />
}
