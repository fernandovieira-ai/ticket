"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmarExclusaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  plantaoInfo: {
    analista: string;
    dtainicio: string;
    dtafinal: string;
  } | null;
  isLoading?: boolean;
}

export function ConfirmarExclusaoModal({
  isOpen,
  onClose,
  onConfirm,
  plantaoInfo,
  isLoading = false
}: ConfirmarExclusaoModalProps) {

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-white">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Confirmar Exclusão</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isLoading}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Conteúdo */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              Tem certeza que deseja excluir este plantão? Esta ação não pode ser desfeita.
            </p>

            {plantaoInfo && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div>
                  <span className="font-medium text-gray-700">Analista:</span>
                  <span className="ml-2 text-gray-900">{plantaoInfo.analista}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Período:</span>
                  <span className="ml-2 text-gray-900">
                    {formatDate(plantaoInfo.dtainicio)} até {formatDate(plantaoInfo.dtafinal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="px-4 py-2"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={onConfirm}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2"
              disabled={isLoading}
            >
              {isLoading ? 'Excluindo...' : 'Excluir Plantão'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}