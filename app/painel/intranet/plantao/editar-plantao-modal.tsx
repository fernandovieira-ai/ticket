"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X } from 'lucide-react';

interface Plantao {
  id: number;
  analista: string;
  dia_semana: string | null;
  dtainicio: string;
  dtafinal: string;
  observacao?: string | null;
  ind_finalizado: string;
}

interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: string;
}

interface EditarPlantaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  plantao: Plantao;
}

export function EditarPlantaoModal({ isOpen, onClose, onSuccess, plantao }: EditarPlantaoModalProps) {
  const [formData, setFormData] = useState({
    dtainicio: '',
    dtafinal: '',
    analista: '',
    dia_semana: '',
    observacao: '',
    ind_finalizado: 'N'
  });
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);

  // Carregar usuários atendentes
  useEffect(() => {
    const carregarUsuarios = async () => {
      try {
        const response = await fetch('/api/usuarios/atendentes');
        if (response.ok) {
          const data = await response.json();
          setUsuarios(data);
        } else {
          console.error('Erro ao carregar usuários');
        }
      } catch (error) {
        console.error('Erro ao carregar usuários:', error);
      } finally {
        setLoadingUsuarios(false);
      }
    };

    if (isOpen) {
      carregarUsuarios();
    }
  }, [isOpen]);

  // Preencher formulário com dados do plantão quando modal abrir
  useEffect(() => {
    if (isOpen && plantao) {
      setFormData({
        dtainicio: plantao.dtainicio ? new Date(plantao.dtainicio).toISOString().split('T')[0] : '',
        dtafinal: plantao.dtafinal ? new Date(plantao.dtafinal).toISOString().split('T')[0] : '',
        analista: plantao.analista || '',
        dia_semana: plantao.dia_semana || '',
        observacao: plantao.observacao || '',
        ind_finalizado: plantao.ind_finalizado
      });
    }
  }, [isOpen, plantao]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.dtainicio || !formData.dtafinal || !formData.analista) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/intranet/plantao/${plantao.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dtainicio: formData.dtainicio,
          dtafinal: formData.dtafinal,
          analista: formData.analista,
          dia_semana: formData.dia_semana || null,
          observacao: formData.observacao || null,
          ind_finalizado: formData.ind_finalizado
        }),
      });

      if (response.ok) {
        onSuccess();
        onClose();
        // Reset form
        setFormData({
          dtainicio: '',
          dtafinal: '',
          analista: '',
          dia_semana: '',
          observacao: '',
          ind_finalizado: 'N'
        });
      } else {
        const error = await response.json();
        alert(error.error || 'Erro ao atualizar plantão');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao atualizar plantão');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-white">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Editar Plantão</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Data Início */}
              <div>
                <label htmlFor="dtainicio" className="block text-sm font-medium text-gray-700 mb-1">
                  Data Início *
                </label>
                <input
                  type="date"
                  id="dtainicio"
                  name="dtainicio"
                  value={formData.dtainicio}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Data Final */}
              <div>
                <label htmlFor="dtafinal" className="block text-sm font-medium text-gray-700 mb-1">
                  Data Final *
                </label>
                <input
                  type="date"
                  id="dtafinal"
                  name="dtafinal"
                  value={formData.dtafinal}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>

            {/* Analista */}
            <div>
              <label htmlFor="analista" className="block text-sm font-medium text-gray-700 mb-1">
                Analista *
              </label>
              {loadingUsuarios ? (
                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                  Carregando usuários...
                </div>
              ) : (
                <select
                  id="analista"
                  name="analista"
                  value={formData.analista}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="">Selecione um analista</option>
                  {usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.nome}>
                      {usuario.nome} ({usuario.perfil})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Dia da Semana */}
            <div>
              <label htmlFor="dia_semana" className="block text-sm font-medium text-gray-700 mb-1">
                Dia da Semana
              </label>
              <select
                id="dia_semana"
                name="dia_semana"
                value={formData.dia_semana}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Selecione</option>
                <option value="Segunda-feira">Segunda-feira</option>
                <option value="Terça-feira">Terça-feira</option>
                <option value="Quarta-feira">Quarta-feira</option>
                <option value="Quinta-feira">Quinta-feira</option>
                <option value="Sexta-feira">Sexta-feira</option>
                <option value="Sábado">Sábado</option>
                <option value="Domingo">Domingo</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label htmlFor="ind_finalizado" className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                id="ind_finalizado"
                name="ind_finalizado"
                value={formData.ind_finalizado}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="N">Em Andamento</option>
                <option value="S">Finalizado</option>
              </select>
            </div>

            {/* Observação */}
            <div>
              <label htmlFor="observacao" className="block text-sm font-medium text-gray-700 mb-1">
                Observação
              </label>
              <textarea
                id="observacao"
                name="observacao"
                rows={3}
                value={formData.observacao}
                onChange={handleChange}
                placeholder="Digite observações sobre o plantão..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
              />
            </div>

            {/* Botões */}
            <div className="flex justify-end space-x-3 pt-6">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="px-6 py-2"
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2"
                disabled={isLoading}
              >
                {isLoading ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}