import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MonitoradorClient from './monitorador-client';
import { getSession } from '@/lib/auth';
import { getMonitoradorData } from '@/lib/monitorador';
import { listarSmartpos } from '@/lib/smartpos';
import { verificarPermissao } from '@/lib/permissoes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Monitorador - Intranet',
  description: 'Monitoramento de redes, empresas e processos',
};

export default async function MonitoradorPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  // Verifica permissão de acesso
  const podeAcessar = await verificarPermissao(
    session.empresaId,
    session.perfil,
    '/painel/intranet/monitorador',
    'pode_acessar'
  );

  if (!podeAcessar) {
    redirect('/painel/dashboard');
  }

  // Verifica se pode editar (bloquear/desbloquear)
  const podeEditar = await verificarPermissao(
    session.empresaId,
    session.perfil,
    '/painel/intranet/monitorador',
    'pode_editar'
  );

  const [dados, smartpos] = await Promise.all([
    getMonitoradorData().catch((error) => {
      console.error('Erro ao buscar dados do monitorador:', error);
      return [];
    }),
    listarSmartpos().catch((error) => {
      console.error('Erro ao buscar clientes Smart POS:', error);
      return [];
    }),
  ]);

  return <MonitoradorClient inicial={dados} smartposInicial={smartpos} podeEditar={podeEditar} />;
}
