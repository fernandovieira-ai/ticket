import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { InformativosClient } from './informativos-client';

export const metadata: Metadata = {
  title: 'Informativos - Intranet',
};

export default async function InformativosPage() {
  const result = await intranetQueries.getInformativos();
  return <InformativosClient initialInformativos={result.rows} />;
}