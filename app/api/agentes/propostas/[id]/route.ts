import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { atualizarStatusProposta, registrarFalhaAutonomia } from '@/agents/core/db';
import { assinaturaErro } from '@/agents/core/assinatura';
import { salvarAprendizado } from '@/agents/core/aprendizado';
import { marcarReprocessarPainel } from '@/agents/core/painel';
import { z } from 'zod';

const schema = z.object({
  status: z.enum(['aprovada', 'rejeitada', 'aplicada', 'falhou']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
  }

  try {
    const proposta = await atualizarStatusProposta(
      id,
      session.empresaId,
      parsed.data.status,
      session.sub,
    );

    if (!proposta) {
      return NextResponse.json({ error: 'Proposta não encontrada' }, { status: 404 });
    }

    // O operador rejeitou a correção proposta: para esta família de erro o agente não merece autonomia
    // até acumular novos sucessos confirmados.
    if (parsed.data.status === 'rejeitada') {
      registrarFalhaAutonomia(session.empresaId, assinaturaErro(proposta.descricao_erro)).catch(() => {});
    }

    // Aprender é automático, não uma escolha do operador. Se a correção não tem SQL
    // (config/código, não-DML), aprovar já é o estado terminal — aprende agora.
    // Se tem SQL, o aprendizado fica pra quando o SQL rodar com sucesso (rota /aplicar),
    // porque uma correção aprovada mas não aplicada ainda não foi validada de verdade.
    if (parsed.data.status === 'aprovada' && !proposta.sql_correcao) {
      salvarAprendizado(session.empresaId, proposta).catch(() => {});
      // Sem SQL a aplicar, aprovar já confirma que está resolvido — libera o painel AS
      // pra reprocessar essa pendência (se ela veio do painel builtin).
      marcarReprocessarPainel(session.empresaId, proposta).catch(() => {});
    }

    return NextResponse.json(proposta);
  } catch (err) {
    console.error('[agentes/propostas PATCH]', err);
    return NextResponse.json({ error: 'Erro ao atualizar proposta' }, { status: 500 });
  }
}
