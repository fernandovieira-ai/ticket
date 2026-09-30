import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { obterFormaPagtoPadrao, definirFormaPagtoPadrao, limparFormaPagtoPadrao } from '@/agents/core/ajuste-pagamento';
import { z } from 'zod';

// Forma de pagamento padrão do "Ajustar forma de pagamento" desta base (cliente) — pra não perguntar de
// novo toda vez que houver um "Cliente sem saldo de adiantamento".
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const cliente_id = req.nextUrl.searchParams.get('cliente_id') ?? '';
  if (!z.string().uuid().safeParse(cliente_id).success) return NextResponse.json({ error: 'cliente_id inválido' }, { status: 400 });

  const forma = await obterFormaPagtoPadrao(session.empresaId, cliente_id);
  return NextResponse.json({ forma });
}

const putSchema = z.object({
  cliente_id: z.string().uuid(),
  formaPagto: z.object({
    id: z.number().int().positive(),
    tipo: z.string().min(1).max(10),
    descricao: z.string().min(1).max(200),
  }),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  await definirFormaPagtoPadrao(session.empresaId, parsed.data.cliente_id, parsed.data.formaPagto);
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ cliente_id: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  await limparFormaPagtoPadrao(session.empresaId, parsed.data.cliente_id);
  return NextResponse.json({ ok: true });
}
