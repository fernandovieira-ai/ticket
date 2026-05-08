"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientDateProps {
  date: string | Date;
  formatString: string;
  fallback?: string;
}

export function ClientDate({ date, formatString, fallback = "" }: ClientDateProps) {
  const [formattedDate, setFormattedDate] = useState(fallback);

  useEffect(() => {
    try {
      const formatted = format(new Date(date), formatString, { locale: ptBR });
      setFormattedDate(formatted);
    } catch (error) {
      console.error("Error formatting date:", error);
      setFormattedDate(fallback);
    }
  }, [date, formatString, fallback]);

  return <>{formattedDate}</>;
}