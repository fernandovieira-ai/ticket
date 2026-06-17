import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { serverCache } from '@/lib/server-cache';
import DtefClient from './dtef-client';

export const metadata: Metadata = {
  title: 'Senhas DTEF - Intranet',
};

export const dynamic = 'force-dynamic';

export default async function DtefPage() {
  let rows: any[] = [];
  try {
    const CACHE_KEY = 'intranet_dtef';
    const cached = serverCache.get<any[]>(CACHE_KEY);
    if (cached) {
      rows = cached;
    } else {
      const result = await intranetQueries.getDtef();
      rows = result.rows ?? result;
      serverCache.set(CACHE_KEY, rows, 15 * 60 * 1000);
    }
  } catch (e) {
    console.error('Erro ao carregar DTEF:', e);
  }

  return <DtefClient inicial={rows} />;
}