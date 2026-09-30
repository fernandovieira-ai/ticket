import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { carregarErrosPainel } from '@/agents/core/painel-erros';
import { z } from 'zod';

const schema = z.object({
  cliente_id: z.string().uuid(),
  forcar: z.enum(['0', '1']).optional(),
});

// Erros PENDENTES do painel EMSys Gestão de uma base (cliente), já classificados por tipo e causa
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const parsed = schema.safeParse({ cliente_id: sp.get('cliente_id'), forcar: sp.get('forcar') ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: 'cliente_id inválido' }, { status: 400 });

  try {
    const dados = await carregarErrosPainel(parsed.data.cliente_id, session.empresaId, parsed.data.forcar === '1');
    return NextResponse.json(dados);
  } catch (e: any) {
    console.error('[agentes/painel-erros]', e?.message);
    return NextResponse.json({ error: 'Erro ao carregar o painel' }, { status: 500 });
  }
}
