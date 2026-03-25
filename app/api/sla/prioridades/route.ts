import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const prioridades = await query<{
    id: string
    codigo: string
    nome: string
    cor: string
    icone: string | null
    ordem: number
    sistema: boolean
    ativo: boolean
    sla_primeira_resposta_min: number
    sla_resolucao_min: number
    sla_alerta_pct: number
  }>(
    `SELECT
       id, codigo, nome, cor, icone, ordem, sistema, ativo,
       ROUND(EXTRACT(epoch FROM sla_primeira_resposta) / 60) AS sla_primeira_resposta_min,
       ROUND(EXTRACT(epoch FROM sla_resolucao) / 60)         AS sla_resolucao_min,
       sla_alerta_pct
     FROM ticket_prioridades
     WHERE (empresa_id = $1 OR empresa_id IS NULL) AND ativo = true
     ORDER BY ordem`,
    [session.empresaId]
  )

  return NextResponse.json(prioridades)
}
