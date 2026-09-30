import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { obterConfig, listarAutoAplicar } from '@/agents/core/db';
import { AgenteConfigClient } from './config-client';

export default async function AgenteConfigPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [config, autoAplicar] = await Promise.all([
    obterConfig(session.empresaId),
    // Falha (ex.: migration add_agentes_auto_aplicar.sql ainda não executada) não derruba a tela
    listarAutoAplicar(session.empresaId).catch(() => []),
  ]);
  return <AgenteConfigClient config={config} autoAplicar={autoAplicar} />;
}
