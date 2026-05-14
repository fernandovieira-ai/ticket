import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import DadosRestritosClient from './dados-restritos-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dados Restritos - Intranet',
  description: 'Gestão de informações confidenciais e dados restritos',
};

export default async function DadosRestritosPage() {
  const result = await intranetQueries.getDadosRestritos();
  return <DadosRestritosClient inicial={result.rows} />;
}