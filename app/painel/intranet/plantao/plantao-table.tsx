"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Edit, Trash2, Clock, CheckCircle, Filter, X } from 'lucide-react';
import { EditarPlantaoModal } from './editar-plantao-modal';
import { ConfirmarExclusaoModal } from './confirmar-exclusao-modal';
import { DateInputBR } from './date-input-br';

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

interface PlantaoTableProps {
  plantoes: Plantao[];
  onRefresh: () => void;
}

export function PlantaoTable({ plantoes, onRefresh }: PlantaoTableProps) {
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPlantao, setSelectedPlantao] = useState<Plantao | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Função para converter data para formato YYYY-MM-DD (formato do input date)
  const toInputDateFormat = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Função auxiliar para normalizar data (pegar apenas ano-mes-dia sem horário)
  const normalizarData = (dateString: string): Date => {
    const date = new Date(dateString);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  };

  // Filtrar plantões baseado nos filtros
  const plantoesFiltrados = useMemo(() => {
    let filtered = plantoes;

    // Filtrar por status
    if (!mostrarFinalizados) {
      filtered = filtered.filter(plantao => plantao.ind_finalizado === 'N');
    }

    // Filtrar por período
    if (dataInicio) {
      const dataInicioFilter = new Date(dataInicio + 'T00:00:00Z'); // Z para UTC
      filtered = filtered.filter(plantao => {
        const plantaoDataInicio = normalizarData(plantao.dtainicio);
        return plantaoDataInicio >= dataInicioFilter;
      });
    }

    if (dataFinal) {
      const dataFinalFilter = new Date(dataFinal + 'T23:59:59Z'); // Z para UTC
      filtered = filtered.filter(plantao => {
        const plantaoDataFinal = normalizarData(plantao.dtafinal);
        return plantaoDataFinal <= dataFinalFilter;
      });
    }

    return filtered;
  }, [plantoes, mostrarFinalizados, dataInicio, dataFinal]);

  const handleLimpar = () => {
    setMostrarFinalizados(false);
    setDataInicio('');
    setDataFinal('');
  };

  const handleEditar = (plantao: Plantao) => {
    setSelectedPlantao(plantao);
    setEditModalOpen(true);
  };

  const handleExcluir = (plantao: Plantao) => {
    setSelectedPlantao(plantao);
    setDeleteModalOpen(true);
  };

  const handleConfirmarExclusao = async () => {
    if (!selectedPlantao) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/intranet/plantao/${selectedPlantao.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onRefresh(); // Recarregar dados
        setDeleteModalOpen(false);
        setSelectedPlantao(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Erro ao excluir plantão');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao excluir plantão');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleModalSuccess = () => {
    onRefresh(); // Recarregar dados após edição
  };

  const formatDate = (dateString: string) => {
    // Parse da data e ajuste para evitar problemas de timezone
    const date = new Date(dateString);

    // Pegar os componentes da data em UTC para evitar problemas de timezone
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${day}/${month}/${year}`;
  };

  const getStatusBadge = (indFinalizado: string) => {
    if (indFinalizado === 'S') {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Finalizado
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="bg-blue-100 text-blue-800 border-blue-200">
        <Clock className="h-3 w-3 mr-1" />
        Em Andamento
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Período */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período:
            </label>
            <div className="flex items-center space-x-2">
              <DateInputBR
                value={dataInicio}
                onChange={setDataInicio}
                title="Data de início"
              />
              <span className="text-gray-500 text-sm">até</span>
              <DateInputBR
                value={dataFinal}
                onChange={setDataFinal}
                title="Data final"
              />
            </div>
          </div>

          {/* Mostrar Finalizados */}
          <div>
            <label className="flex items-center space-x-2 mt-6">
              <input
                type="checkbox"
                checked={mostrarFinalizados}
                onChange={(e) => setMostrarFinalizados(e.target.checked)}
                className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 focus:ring-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Mostrar Finalizados
              </span>
            </label>
          </div>

          {/* Botões */}
          <div className="flex space-x-2">
            <Button
              onClick={() => {}} // Filtrar é automático
              variant="outline"
              className="border-2 border-[#0E1326] text-[#0E1326] bg-white hover:bg-[#A3E635] hover:border-[#A3E635] hover:text-[#0E1326] px-5 py-2 h-10 font-semibold rounded-lg transition-colors"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtrar
            </Button>
            <Button
              onClick={handleLimpar}
              variant="outline"
              className="border-2 border-[#0E1326] text-[#0E1326] bg-white hover:bg-[#A3E635] hover:border-[#A3E635] hover:text-[#0E1326] px-5 py-2 h-10 font-semibold rounded-lg transition-colors"
            >
              <X className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data Início
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data Final
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Analista
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dia da Semana
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Observação
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {plantoesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Nenhum plantão encontrado
                  </td>
                </tr>
              ) : (
                plantoesFiltrados.map((plantao) => (
                  <tr key={plantao.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(plantao.dtainicio)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(plantao.dtafinal)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {plantao.analista}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {plantao.dia_semana || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {plantao.observacao || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(plantao.ind_finalizado)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditar(plantao)}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-md transition-colors"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </button>
                        <button
                          onClick={() => handleExcluir(plantao)}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Contador */}
      <div className="text-sm text-gray-600 text-center">
        Mostrando {plantoesFiltrados.length} de {plantoes.length} plantões
      </div>

      {/* Modais */}
      {selectedPlantao && (
        <EditarPlantaoModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedPlantao(null);
          }}
          onSuccess={handleModalSuccess}
          plantao={selectedPlantao}
        />
      )}

      <ConfirmarExclusaoModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedPlantao(null);
        }}
        onConfirm={handleConfirmarExclusao}
        plantaoInfo={selectedPlantao ? {
          analista: selectedPlantao.analista,
          dtainicio: selectedPlantao.dtainicio,
          dtafinal: selectedPlantao.dtafinal
        } : null}
        isLoading={isDeleting}
      />
    </div>
  );
}