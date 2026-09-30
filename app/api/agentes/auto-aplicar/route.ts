import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { definirAutoAplicar } from '@/agents/core/db';
import { z } from 'zod';

const schema = z.object({
  assinatura_hash: z.string().regex(/^[0-9a-f]{32}$/),
  assinatura: z.string().max(1000),
});

// Desativa a execução automática de um tipo de erro: volta a exigir aprovação do operador
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  try {
    await definirAutoAplicar(
      session.empresaId,
      { hash: parsed.data.assinatura_hash, normalizada: parsed.data.assinatura },
      false,
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[agentes/auto-aplicar DELETE]', e?.message);
    return NextResponse.json({ error: 'Erro ao desativar a execução automática' }, { status: 500 });
  }
}
