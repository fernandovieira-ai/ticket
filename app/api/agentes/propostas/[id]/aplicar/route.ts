import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { aplicarProposta } from '@/agents/core/aplicar';
import { definirAutoAplicar } from '@/agents/core/db';
import { assinaturaErro } from '@/agents/core/assinatura';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  // Corpo opcional: { auto_aplicar: true } marca o TIPO deste erro para o agente executar sozinho
  const body = await req.json().catch(() => ({}));
  const marcarAuto = body?.auto_aplicar === true;

  // Validações, travas de segurança, execução, aprendizado e liberação do painel vivem no serviço —
  // o mesmo código que o agente usa quando aplica sozinho (autonomia).
  const r = await aplicarProposta(session.empresaId, id, { tipo: 'usuario', id: session.sub });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });

  // A marcação só vale depois que o SQL rodou com sucesso (correção validada de verdade)
  let autoMarcado = false;
  let avisoAuto: string | undefined;
  if (marcarAuto) {
    try {
      await definirAutoAplicar(session.empresaId, assinaturaErro(r.proposta.descricao_erro), true, session.sub);
      autoMarcado = true;
    } catch (e: any) {
      console.error('[agentes/aplicar] falha ao marcar execução automática:', e?.message);
      avisoAuto = 'O SQL foi aplicado, mas não foi possível marcar o tipo de erro para execução automática (a migration add_agentes_auto_aplicar.sql já foi executada?).';
    }
  }

  const linhas = r.resultados.map((x) => `${x.rowCount} linha(s) afetada(s)`).join(', ');
  return NextResponse.json({
    proposta: r.proposta,
    resultados: r.resultados,
    auto_aplicar_marcado: autoMarcado,
    mensagem:
      `SQL aplicado com sucesso. ${linhas}.` +
      (autoMarcado ? ' Este tipo de erro agora será executado automaticamente pelo agente.' : '') +
      (avisoAuto ? ` ${avisoAuto}` : ''),
  });
}
