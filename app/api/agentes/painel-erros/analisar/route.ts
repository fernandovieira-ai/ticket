import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { analisarGrupoPainel } from '@/agents/orchestrator/analisar-grupo';
import { z } from 'zod';

// A investigação faz várias consultas às bases e chamadas à IA: pode levar alguns minutos
export const maxDuration = 300;

const schema = z.object({
  cliente_id: z.string().uuid(),
  codigos: z.array(z.string().regex(/^\d{1,18}$/)).min(1).max(1000),
  categoria: z.string().min(1).max(300),
  causa: z.string().min(1).max(300),
});

// Analisa UM grupo de erros do painel (tipo + causa) e devolve a proposta (aguardando). Não aplica nada.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  try {
    const r = await analisarGrupoPainel({ empresa_id: session.empresaId, ...parsed.data });
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro, total: r.total, empresas: r.empresas });
    const p = r.proposta!;
    return NextResponse.json({
      ok: true,
      existente: r.existente === true,
      total: r.total,
      empresas: r.empresas,
      proposta: {
        id: p.id, titulo: p.titulo, analise: p.analise, correcao_proposta: p.correcao_proposta,
        sql_correcao: p.sql_correcao, base_alvo: p.base_alvo, tipo: p.tipo, nivel_risco: p.nivel_risco,
        status: p.status, painel_codigo: p.painel_codigo,
      },
    });
  } catch (e: any) {
    console.error('[agentes/painel-erros/analisar]', e?.message);
    return NextResponse.json({ ok: false, erro: 'Erro ao analisar o grupo' }, { status: 500 });
  }
}
