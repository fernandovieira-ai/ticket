import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { conferirSaldoCombustivel } from '@/agents/core/conferir-combustivel';
import { z } from 'zod';

const schema = z.object({
  cliente_id: z.string().uuid(),
  codigos: z.array(z.string().regex(/^\d{1,18}$/)).min(1).max(1000),
});

// Conferência de saldo de combustível: só lê e devolve o veredito (pronto para reprocessar ou não).
// Nunca lança entrada nem corrige nada — combustível é medição física, fora do escopo de ajuste do painel.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const r = await conferirSaldoCombustivel(parsed.data.cliente_id, session.empresaId, parsed.data.codigos);
  return NextResponse.json(r);
}
