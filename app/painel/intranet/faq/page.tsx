import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { FaqClient } from './faq-client';

export const metadata: Metadata = {
  title: 'FAQ - Intranet',
  description: 'Base de conhecimento e soluções de problemas',
};

export default async function FaqPage() {
  const faqRows = await intranetQueries.getFaq();
  const sistemasRows = await intranetQueries.getSistemas();

  const faq = faqRows.rows ?? faqRows;
  const sistemas: string[] = (sistemasRows.rows ?? sistemasRows).map(
    (s: { nom_sistema: string }) => s.nom_sistema
  );

  return <FaqClient initialFaq={faq} sistemas={sistemas} />;
}