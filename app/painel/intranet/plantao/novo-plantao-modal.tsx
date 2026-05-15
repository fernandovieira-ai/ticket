"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Calendar, User } from 'lucide-react';
import { DateInputBR } from './date-input-br';

interface NovoPlantaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Analista {
  id: string;
  nome: string;
  email: string;
  perfil: string;
}

export function NovoPlantaoModal({ isOpen, onClose, onSuccess }: NovoPlantaoModalProps) {
  const [formData, setFormData] = useState({
    dtainicio: '',
    dtafinal: '',
    analista: '',
    dia_semana: '',
    observacao: '',
  });
  const [loading, setLoading] = useState(false);
  const [analistas, setAnalistas] = useState<Analista[]>([]);
  const [loadingAnalistas, setLoadingAnalistas] = useState(false);

  // Carregar analistas quando o modal abrir
  useEffect(() => {
    if (isOpen) {
      loadAnalistas();
    }
  }, [isOpen]);

  const loadAnalistas = async () => {
    setLoadingAnalistas(true);
    try {
      const response = await fetch('/api/usuarios/atendentes');
      if (response.ok) {
        const data = await response.json();
        setAnalistas(data);
      } else {
        console.error('Erro ao carregar analistas');
      }
    } catch (error) {
      console.error('Erro ao carregar analistas:', error);
    } finally {
      setLoadingAnalistas(false);
    }
  };

  const diasSemana = [
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
    'Domingo'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/intranet/plantao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSuccess();
        onClose();
        setFormData({
          dtainicio: '',
          dtafinal: '',
          analista: '',
          dia_semana: '',
          observacao: '',
        });
      } else {
        alert('Erro ao salvar plantão');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao salvar plantão');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4 bg-white shadow-xl border-0">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Novo Plantão</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Data Início */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Data Início <span className="text-red-500">*</span>
              </label>
              <DateInputBR
                value={formData.dtainicio}
                onChange={(value) => handleChange('dtainicio', value)}
                title="Data de início do plantão"
                className="border-gray-200 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            {/* Data Final */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Data Final <span className="text-red-500">*</span>
              </label>
              <DateInputBR
                value={formData.dtafinal}
                onChange={(value) => handleChange('dtafinal', value)}
                title="Data final do plantão"
                className="border-gray-200 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            {/* Analista */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Analista <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <select
                  value={formData.analista}
                  onChange={(e) => handleChange('analista', e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors appearance-none bg-white"
                  required
                  disabled={loadingAnalistas}
                >
                  <option value="">
                    {loadingAnalistas ? 'Carregando analistas...' : 'Selecione um analista...'}
                  </option>
                  {analistas.map((analista) => (
                    <option key={analista.id} value={analista.nome}>
                      {analista.nome} ({analista.perfil})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dia da Semana */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Dia da Semana
              </label>
              <select
                value={formData.dia_semana}
                onChange={(e) => handleChange('dia_semana', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors appearance-none bg-white"
              >
                <option value="">Selecione...</option>
                {diasSemana.map((dia) => (
                  <option key={dia} value={dia}>
                    {dia}
                  </option>
                ))}
              </select>
            </div>

            {/* Observação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Observação
              </label>
              <textarea
                value={formData.observacao}
                onChange={(e) => handleChange('observacao', e.target.value)}
                placeholder="Observações sobre o plantão"
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1 h-10"
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 h-10 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-0"
                disabled={loading}
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}