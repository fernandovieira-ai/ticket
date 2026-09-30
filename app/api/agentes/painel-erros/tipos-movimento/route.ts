import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buscarTiposMovimentoDoCliente } from '@/agents/core/ajuste-estoque';
import { z } from 'zod';

const schema = z.object({
  cliente_id: z.string().uuid(),
  mensagem: z.string().min(1).max(200),
});

// Busca tipos de movimento de ENTRADA no catálogo do EMSys3 do cliente, a partir da mensagem livre do operador
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const r = await buscarTiposMovimentoDoCliente(parsed.data.cliente_id, session.empresaId, parsed.data.mensagem);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro });
  return NextResponse.json({ ok: true, candidatos: r.candidatos });
}
