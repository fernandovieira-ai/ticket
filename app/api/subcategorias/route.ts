import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { Subcategoria } from '@/types'

// GET /api/subcategorias
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const categoriaId = searchParams.get('categoria_id') ?? ''
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)
  const offset = (page - 1) * pageSize

  const rows = await query<Subcategoria & { total: number }>(
    `SELECT s.id, s.empresa_id, s.nome, s.descricao, s.ativo, s.criado_em,
            ARRAY(
              SELECT c.nome FROM cadegoria_subcategoria cs
              JOIN categorias c ON c.id = cs.categoria_id
              WHERE cs.subcategoria_id = s.id
            ) AS categorias_nomes,
            COUNT(*) OVER() AS total
     FROM subcategorias s
     WHERE s.empresa_id = $1
       AND ($2 = '' OR s.nome ILIKE '%' || $2 || '%')
       AND ($5 = '' OR EXISTS (
             SELECT 1 FROM cadegoria_subcategoria cs
             WHERE cs.subcategoria_id = s.id AND cs.categoria_id::text = $5
           ))
     ORDER BY s.nome
     LIMIT $3 OFFSET $4`,
    [session.empresaId, q, pageSize, offset, categoriaId]
  )

  const total = rows[0]?.total ?? 0
  const res = NextResponse.json({ data: rows, total: Number(total), page, pageSize })
  res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
  return res
}

const createSchema = z.object({
  nome: z.string().min(2).max(100),
  descricao: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
})

// POST /api/subcategorias
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(session.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { nome, descricao, ativo } = parsed.data

  const existe = await query(
    `SELECT id FROM subcategorias WHERE nome = $1 AND empresa_id = $2 LIMIT 1`,
    [nome, session.empresaId]
  )
  if (existe.length > 0) {
    return NextResponse.json({ error: 'Já existe uma subcategoria com este nome' }, { status: 409 })
  }

  const [sub] = await query<Subcategoria>(
    `INSERT INTO subcategorias (empresa_id, nome, descricao, ativo)
     VALUES ($1, $2, $3, $4)
     RETURNING id, empresa_id, nome, descricao, ativo, criado_em`,
    [session.empresaId, nome, descricao ?? null, ativo ?? true]
  )
  return NextResponse.json(sub, { status: 201 })
}
