import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { obterConfig } from '@/agents/core/db';
import { AgenteConfigClient } from './config-client';

export default async function AgenteConfigPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const config = await obterConfig(session.empresaId);
  return <AgenteConfigClient config={config} />;
}
