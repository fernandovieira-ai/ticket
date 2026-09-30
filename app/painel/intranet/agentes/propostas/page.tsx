import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listarPropostas, obterConfig } from '@/agents/core/db';
import { AgentesClient } from '../agentes-client';

// Propostas dos agentes (aguardando, aprovadas, aplicadas): a tela que antes era a principal de Agentes
export default async function PropostasPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [propostas, config] = await Promise.all([
    listarPropostas(session.empresaId),
    obterConfig(session.empresaId),
  ]);

  return <AgentesClient propostas={propostas} config={config} />;
}
