import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listarClientes, listarPropostas } from '@/agents/core/db';
import { PainelHome } from './painel/painel-home';

// Tela principal de Agentes: o Painel de Erros (uma base por card, só as que têm erro)
export default async function AgentesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [clientes, propostas] = await Promise.all([
    listarClientes(session.empresaId),
    listarPropostas(session.empresaId).catch(() => []),
  ]);

  const bases = clientes.filter((c) => c.ativo && c.analise_painel).map((c) => ({ id: c.id, nome: c.nome }));
  const aguardando = propostas.filter((p) => p.status === 'aguardando').length;

  return <PainelHome bases={bases} aguardando={aguardando} />;
}
