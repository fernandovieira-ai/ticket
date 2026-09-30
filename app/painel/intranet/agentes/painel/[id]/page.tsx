import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listarClientes } from '@/agents/core/db';
import { PainelPagina } from '../painel-pagina';

// Página própria do painel de uma base (antes era um modal em cima da tela principal)
export default async function PainelBasePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const clientes = await listarClientes(session.empresaId);
  const cliente = clientes.find((c) => c.id === id && c.ativo && c.analise_painel);
  if (!cliente) redirect('/painel/intranet/agentes');

  return <PainelPagina base={{ id: cliente.id, nome: cliente.nome }} />;
}
