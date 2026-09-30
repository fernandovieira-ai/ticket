import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { previewAjustePagamento } from '@/agents/core/ajuste-pagamento';
import { z } from 'zod';

const schema = z.object({
  cliente_id: z.string().uuid(),
  codigos: z.array(z.string().regex(/^\d{1,18}$/)).min(1).max(1000),
});

// Prévia do ajuste: mostra o valor e a forma de pagamento atual (Adiantamento Cliente) de cada venda. Não escreve nada.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const r = await previewAjustePagamento(parsed.data.cliente_id, session.empresaId, parsed.data.codigos);
  return NextResponse.json(r);
}
