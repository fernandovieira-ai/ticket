import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listarClientes } from '@/agents/core/db';
import { ClientesClient } from './clientes-client';

export default async function AgentesClientesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const clientes = await listarClientes(session.empresaId);
  const publico = clientes.map((c) => ({ ...c, db_senha: '••••••••' }));

  return <ClientesClient clientes={publico} />;
}
