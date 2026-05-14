import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import AnydeskClient from './anydesk-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AnyDesk - Intranet',
  description: 'Gestão de acessos remotos AnyDesk',
};

export default async function AnydeskPage() {
  const result = await intranetQueries.getAnydeskAcessos();
  return <AnydeskClient inicial={result.rows} />;
}