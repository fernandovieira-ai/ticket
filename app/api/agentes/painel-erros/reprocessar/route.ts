import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { reprocessarPainel } from '@/agents/core/painel-erros';
import { z } from 'zod';

const schema = z.object({
  cliente_id: z.string().uuid(),
  codigos: z.array(z.string().regex(/^\d{1,18}$/)).min(1).max(1000),
});

// Só reprocessar no painel: marca os códigos com reprocessar = true. Não altera dados do cliente além disso.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  try {
    const r = await reprocessarPainel(parsed.data.cliente_id, session.empresaId, parsed.data.codigos, session.sub);
    return NextResponse.json(r);
  } catch (e: any) {
    console.error('[agentes/painel-erros/reprocessar]', e?.message);
    return NextResponse.json({ ok: false, erro: 'Erro ao reprocessar', marcados: 0, ignorados: 0 }, { status: 500 });
  }
}
