import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { obterTipoMovimentoPadrao, definirTipoMovimentoPadrao, limparTipoMovimentoPadrao } from '@/agents/core/ajuste-estoque';
import { z } from 'zod';

// Tipo de movimento de entrada padrão do "Ajustar estoque" desta base (cliente) — pra não perguntar de
// novo toda vez que houver um "Saldo insuficiente · Produto de loja".
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const cliente_id = req.nextUrl.searchParams.get('cliente_id') ?? '';
  if (!z.string().uuid().safeParse(cliente_id).success) return NextResponse.json({ error: 'cliente_id inválido' }, { status: 400 });

  const tipo = await obterTipoMovimentoPadrao(session.empresaId, cliente_id);
  return NextResponse.json({ tipo });
}

const putSchema = z.object({
  cliente_id: z.string().uuid(),
  tipoMovimento: z.object({
    id: z.number().int().positive(),
    descricao: z.string().min(1).max(200),
  }),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  await definirTipoMovimentoPadrao(session.empresaId, parsed.data.cliente_id, parsed.data.tipoMovimento);
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ cliente_id: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  await limparTipoMovimentoPadrao(session.empresaId, parsed.data.cliente_id);
  return NextResponse.json({ ok: true });
}
