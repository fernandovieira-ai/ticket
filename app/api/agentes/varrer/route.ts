import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { varrerClientes } from '@/agents/orchestrator/varrer';
import { obterConfig, listarClientes } from '@/agents/core/db';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  try {
    // Diagnóstico rápido para feedback ao usuário
    const [config, clientes] = await Promise.all([
      obterConfig(session.empresaId),
      listarClientes(session.empresaId),
    ]);

    if (!config?.ativo) {
      return NextResponse.json({
        ok: false,
        total_analisados: 0,
        resultados: [],
        diagnostico: 'Agente desativado. Ative nas configurações.',
      });
    }

    const clientesAtivos = clientes.filter((c) => c.ativo && (c.query_erros || c.analise_painel));
    if (clientesAtivos.length === 0) {
      const semConfig = clientes.filter((c) => c.ativo && !c.query_erros && !c.analise_painel);
      const msg = semConfig.length > 0
        ? `Nenhum cliente com varredura ativa. ${semConfig.map((c) => c.nome).join(', ')} não tem query nem painel configurado.`
        : 'Nenhum cliente ativo com varredura configurada.';
      return NextResponse.json({
        ok: false,
        total_analisados: 0,
        resultados: [],
        diagnostico: msg,
      });
    }

    const resultados = await varrerClientes(session.empresaId);
    const total_analisados = resultados.reduce((s, r) => s + r.erros_analisados, 0);
    const erros_cliente    = resultados.filter((r) => r.erro).map((r) => `${r.cliente_nome}: ${r.erro}`);
    return NextResponse.json({
      ok:               true,
      total_analisados,
      resultados,
      diagnostico: erros_cliente.length > 0 ? erros_cliente.join(' | ') : null,
    });
  } catch (e: any) {
    console.error('[agentes/varrer]', e);
    return NextResponse.json({ error: e?.message ?? 'Erro ao varrer' }, { status: 500 });
  }
}
