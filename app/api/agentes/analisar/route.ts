import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { processarErro } from '@/agents/orchestrator';
import { z } from 'zod';

const schema = z.object({
  descricao_erro: z.string().min(10, 'Descreva o erro com pelo menos 10 caracteres'),
  contexto:       z.string().optional(),
  stack_trace:    z.string().optional(),
  cliente_id:     z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const resultado = await processarErro({
      empresa_id: session.empresaId,
      ...parsed.data,
    });
    return NextResponse.json(resultado, { status: 201 });
  } catch (err) {
    console.error('[agentes/analisar]', err);
    return NextResponse.json({ error: 'Erro ao processar analise' }, { status: 500 });
  }
}
