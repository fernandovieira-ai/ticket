import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { aplicarAjustePagamento } from '@/agents/core/ajuste-pagamento';
import { z } from 'zod';

const schema = z.object({
  cliente_id: z.string().uuid(),
  codigos: z.array(z.string().regex(/^\d{1,18}$/)).min(1).max(1000),
  forma: z.object({
    id: z.number().int().positive(),
    tipo: z.string().min(1).max(10),
    descricao: z.string().min(1).max(200),
  }),
});

// Troca a forma de pagamento (só o registro interno/caixa; a nota fiscal não é alterada) e reprocessa no painel
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const r = await aplicarAjustePagamento(parsed.data.cliente_id, session.empresaId, parsed.data.codigos, parsed.data.forma, session.sub);
  return NextResponse.json(r);
}
