import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { aplicarAjusteEstoque } from '@/agents/core/ajuste-estoque';
import { z } from 'zod';

const schema = z.object({
  cliente_id: z.string().uuid(),
  codigos: z.array(z.string().regex(/^\d{1,18}$/)).min(1).max(1000),
  // null é aceito quando a prévia só tem códigos "semDeficit" (saldo real já suficiente) — nada é
  // inserido, só reprocessa, então o tipo de movimento não faz falta.
  tipoMovimento: z.object({
    id: z.number().int().positive(),
    descricao: z.string().min(1).max(200),
  }).nullable(),
});

// Lança a(s) entrada(s) de estoque cobrindo o déficit real confirmado e reprocessa no painel
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const r = await aplicarAjusteEstoque(parsed.data.cliente_id, session.empresaId, parsed.data.codigos, parsed.data.tipoMovimento, session.sub);
  return NextResponse.json(r);
}
