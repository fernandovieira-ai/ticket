import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getSession } from '@/lib/auth'

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
  const body = await req.json()
  const { sla_primeira_resposta_min, sla_resolucao_min, sla_alerta_pct } = body

  if (!sla_primeira_resposta_min || sla_primeira_resposta_min <= 0) {
    return NextResponse.json({ error: 'Prazo de primeira resposta inválido' }, { status: 400 })
  }
  if (!sla_resolucao_min || sla_resolucao_min <= 0) {
    return NextResponse.json({ error: 'Prazo de resolução inválido' }, { status: 400 })
  }
  if (sla_alerta_pct < 50 || sla_alerta_pct > 100) {
    return NextResponse.json({ error: 'Alerta deve ser entre 50 e 100' }, { status: 400 })
  }

  const updated = await queryOne(
    `UPDATE ticket_prioridades
     SET sla_primeira_resposta = (($1)::text || ' minutes')::interval,
         sla_resolucao          = (($2)::text || ' minutes')::interval,
         sla_alerta_pct         = $3,
         atualizado_em          = NOW()
     WHERE id = $4 AND (empresa_id = $5 OR empresa_id IS NULL)
     RETURNING
       id, nome, cor,
       ROUND(EXTRACT(epoch FROM sla_primeira_resposta) / 60) AS sla_primeira_resposta_min,
       ROUND(EXTRACT(epoch FROM sla_resolucao) / 60)         AS sla_resolucao_min,
       sla_alerta_pct`,
    [sla_primeira_resposta_min, sla_resolucao_min, sla_alerta_pct, id, session.empresaId]
  )

  if (!updated) {
    return NextResponse.json({ error: 'Prioridade não encontrada' }, { status: 404 })
  }

  return NextResponse.json(updated)
}
