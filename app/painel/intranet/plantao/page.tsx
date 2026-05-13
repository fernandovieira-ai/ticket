import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { PlantaoClient } from './plantao-client';

export const metadata: Metadata = {
  title: 'Plantões - Intranet',
  description: 'Controle de escalas e plantões dos analistas',
};

export default async function PlantaoPage() {
  // Buscar todos os plantões no servidor
  const plantao = await intranetQueries.getPlantao();

  return <PlantaoClient initialPlantoes={plantao.rows} />;
}