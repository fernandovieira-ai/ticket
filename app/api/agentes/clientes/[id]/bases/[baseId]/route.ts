import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { atualizarBase, deletarBase } from '@/agents/core/db';
import { z } from 'zod';

const schemaUpdate = z.object({
  nome:       z.string().min(2).max(100).optional(),
  descricao:  z.string().max(300).optional().nullable(),
  db_host:    z.string().min(1).max(200).optional(),
  db_porta:   z.coerce.number().int().min(1).max(65535).optional(),
  db_nome:    z.string().min(1).max(100).optional(),
  db_usuario: z.string().min(1).max(100).optional(),
  db_senha:   z.string().min(1).optional(),
  db_schema:  z.string().max(50).optional(),
  ativo:      z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; baseId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { baseId } = await params;
  const body = await req.json();

  if (body.db_senha === '••••••••') delete body.db_senha;

  const parsed = schemaUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const base = await atualizarBase(baseId, session.empresaId, parsed.data);
    if (!base) return NextResponse.json({ error: 'Nao encontrada' }, { status: 404 });
    return NextResponse.json({ ...base, db_senha: '••••••••' });
  } catch (err) {
    console.error('[agentes/bases PUT]', err);
    return NextResponse.json({ error: 'Erro ao atualizar base' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; baseId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { baseId } = await params;
  const ok = await deletarBase(baseId, session.empresaId);
  if (!ok) return NextResponse.json({ error: 'Nao encontrada' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
