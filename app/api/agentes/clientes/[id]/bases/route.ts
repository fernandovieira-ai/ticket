import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarBases, criarBase } from '@/agents/core/db';
import { z } from 'zod';

const schemaCreate = z.object({
  nome:        z.string().min(2).max(100),
  descricao:   z.string().max(300).optional().nullable(),
  db_host:     z.string().min(1).max(200),
  db_porta:    z.coerce.number().int().min(1).max(65535).default(5432),
  db_nome:     z.string().min(1).max(100),
  db_usuario:  z.string().min(1).max(100),
  db_senha:    z.string().min(1),
  db_schema:   z.string().max(50).default('public'),
  ativo:       z.boolean().default(true),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const bases = await listarBases(id, session.empresaId);
  return NextResponse.json(bases.map((b) => ({ ...b, db_senha: '••••••••' })));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schemaCreate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const base = await criarBase(session.empresaId, {
      ...parsed.data,
      cliente_id: id,
      descricao:  parsed.data.descricao ?? null,
    });
    return NextResponse.json({ ...base, db_senha: '••••••••' }, { status: 201 });
  } catch (err: any) {
    console.error('[agentes/bases POST]', err);
    const detail = err?.message ?? 'Erro desconhecido';
    return NextResponse.json({ error: `Erro ao criar base: ${detail}` }, { status: 500 });
  }
}
