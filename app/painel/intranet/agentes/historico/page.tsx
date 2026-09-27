import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listarPropostas, listarConhecimentoAtivo } from '@/agents/core/db';
import { HistoricoClient } from './historico-client';

export default async function HistoricoPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [todas, conhecimento] = await Promise.all([
    listarPropostas(session.empresaId),
    listarConhecimentoAtivo(session.empresaId),
  ]);
  const ESTADOS_RESOLVIDOS = new Set(['aplicada', 'rejeitada', 'aprovada', 'obsoleta']);
  const resolvidas = todas.filter((p) => ESTADOS_RESOLVIDOS.has(p.status));

  return <HistoricoClient propostas={resolvidas} conhecimento={conhecimento} />;
}
