"use client";

import { useState } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { PlantaoTable } from './plantao-table';
import { NovoPlantaoModal } from './novo-plantao-modal';

interface Plantao {
  id: number;
  analista: string;
  dia_semana: string | null;
  dtainicio: string;
  dtafinal: string;
  observacao?: string | null;
  ind_finalizado: string;
  criado_em: string;
}

interface PlantaoClientProps {
  initialPlantoes: Plantao[];
}

export function PlantaoClient({ initialPlantoes }: PlantaoClientProps) {
  const [plantoes, setPlantoes] = useState<Plantao[]>(initialPlantoes);
  const [modalOpen, setModalOpen] = useState(false);

  const handleSuccess = async () => {
    // Recarregar dados após salvar
    try {
      const response = await fetch('/api/intranet/plantao');
      if (response.ok) {
        const updatedPlantoes = await response.json();
        setPlantoes(updatedPlantoes);
      }
    } catch (error) {
      console.error('Erro ao recarregar dados:', error);
    }
  };

  return (
    <div className="container mx-auto p-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plantões</h1>
            <p className="text-sm text-gray-600">Controle de escalas e plantões dos analistas</p>
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="btn-novo-plantao"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Plantão
        </button>
      </div>

      {/* Tabela com filtros */}
      <PlantaoTable plantoes={plantoes} onRefresh={handleSuccess} />

      {/* Modal */}
      <NovoPlantaoModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}