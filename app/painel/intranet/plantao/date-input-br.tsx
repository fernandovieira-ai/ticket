"use client";

import { Calendar } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface DateInputBRProps {
  value: string; // Formato ISO: YYYY-MM-DD
  onChange: (isoDate: string) => void;
  placeholder?: string;
  className?: string;
  title?: string;
}

export function DateInputBR({ value, onChange, placeholder = "dd/mm/aaaa", className = "", title }: DateInputBRProps) {
  const [displayValue, setDisplayValue] = useState('');
  const datePickerRef = useRef<HTMLInputElement>(null);

  // Converte ISO para formato brasileiro
  const isoToBR = (isoDate: string): string => {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  };

  // Converte formato brasileiro para ISO
  const brToISO = (brDate: string): string => {
    if (!brDate) return '';
    const cleaned = brDate.replace(/\D/g, '');
    if (cleaned.length !== 8) return '';

    const day = cleaned.substring(0, 2);
    const month = cleaned.substring(2, 4);
    const year = cleaned.substring(4, 8);

    // Validar data
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (date.getFullYear() !== parseInt(year) ||
        date.getMonth() !== parseInt(month) - 1 ||
        date.getDate() !== parseInt(day)) {
      return '';
    }

    return `${year}-${month}-${day}`;
  };

  // Atualiza o valor de exibição quando o valor ISO muda
  useEffect(() => {
    setDisplayValue(isoToBR(value));
  }, [value]);

  // Aplicar máscara durante a digitação
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, ''); // Remove tudo que não é dígito

    // Limitar a 8 dígitos (ddmmyyyy)
    val = val.substring(0, 8);

    // Aplicar máscara
    let formatted = '';
    if (val.length > 0) {
      formatted = val.substring(0, 2); // dd
      if (val.length >= 3) {
        formatted += '/' + val.substring(2, 4); // mm
      }
      if (val.length >= 5) {
        formatted += '/' + val.substring(4, 8); // yyyy
      }
    }

    setDisplayValue(formatted);

    // Se a data estiver completa, converter para ISO e notificar
    if (val.length === 8) {
      const isoDate = brToISO(formatted);
      if (isoDate) {
        onChange(isoDate);
      }
    } else if (formatted === '') {
      onChange('');
    }
  };

  const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isoDate = e.target.value;
    onChange(isoDate);
  };

  const handleCalendarClick = () => {
    datePickerRef.current?.showPicker();
  };

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={handleCalendarClick}
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10 hover:text-gray-600 transition-colors"
        title="Abrir calendário"
      >
        <Calendar className="h-4 w-4" />
      </button>
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        title={title}
        className={`w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm ${className}`}
        maxLength={10}
      />
      {/* Input date oculto para usar o date picker nativo */}
      <input
        ref={datePickerRef}
        type="date"
        value={value}
        onChange={handleDatePickerChange}
        className="absolute left-0 top-0 w-0 h-0 opacity-0 pointer-events-none"
        tabIndex={-1}
      />
    </div>
  );
}
