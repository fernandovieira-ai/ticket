import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listarPropostas, obterConfig } from '@/agents/core/db';
import { AgentesClient } from './agentes-client';

export default async function AgentesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [propostas, config] = await Promise.all([
    listarPropostas(session.empresaId),
    obterConfig(session.empresaId),
  ]);

  return <AgentesClient propostas={propostas} config={config} />;
}
