import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import DtefClient from './dtef-client';

export const metadata: Metadata = {
  title: 'Senhas DTEF - Intranet',
};

export const dynamic = 'force-dynamic';

export default async function DtefPage() {
  let rows: any[] = [];
  try {
    const result = await intranetQueries.getDtef();
    rows = result.rows ?? result;
  } catch (e) {
    console.error('Erro ao carregar DTEF:', e);
  }

  return <DtefClient inicial={rows} />;
}