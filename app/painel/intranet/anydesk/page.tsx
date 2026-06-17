import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { serverCache } from '@/lib/server-cache';
import AnydeskClient from './anydesk-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AnyDesk - Intranet',
  description: 'Gestão de acessos remotos AnyDesk',
};

export default async function AnydeskPage() {
  const CACHE_KEY = 'intranet_anydesk';
  let rows: any[] = [];
  try {
    const cached = serverCache.get<any[]>(CACHE_KEY);
    if (cached) {
      rows = cached;
    } else {
      const result = await intranetQueries.getAnydeskAcessos();
      rows = result.rows ?? result;
      serverCache.set(CACHE_KEY, rows, 15 * 60 * 1000);
    }
  } catch (e) {
    console.error('Erro ao carregar AnyDesk:', e);
  }
  return <AnydeskClient inicial={rows} />;
}