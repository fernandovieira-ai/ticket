import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const horarios = await query<{
    dia_semana: number
    hora_inicio: string
    hora_fim: string
    ativo: boolean
  }>(
    `SELECT dia_semana,
            hora_inicio::text,
            hora_fim::text,
            ativo
     FROM horario_comercial
     WHERE empresa_id = $1
     ORDER BY dia_semana`,
    [session.empresaId]
  )

  return NextResponse.json(horarios)
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(session.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const horarios: Array<{
    dia_semana: number
    hora_inicio: string
    hora_fim: string
    ativo: boolean
  }> = await req.json()

  // Remove existing and re-insert
  await query('DELETE FROM horario_comercial WHERE empresa_id = $1', [session.empresaId])

  for (const h of horarios) {
    await query(
      `INSERT INTO horario_comercial (empresa_id, dia_semana, hora_inicio, hora_fim, ativo)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.empresaId, h.dia_semana, h.hora_inicio, h.hora_fim, h.ativo]
    )
  }

  return NextResponse.json({ ok: true })
}
