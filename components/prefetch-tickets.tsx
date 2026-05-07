'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Componente que prefetch dados de tickets quando usuário navega
export function PrefetchTickets() {
  const pathname = usePathname();

  useEffect(() => {
    // Prefetch tickets se estivermos próximos da página de tickets
    if (pathname.includes('painel') && !pathname.includes('tickets')) {
      // Prefetch discreto em background
      fetch('/api/tickets?pageSize=20', {
        priority: 'low',
      }).catch(() => {
        // Ignore erros de prefetch
      });
    }
  }, [pathname]);

  return null; // Componente invisível
}

// Hook para optimistic loading
export function useOptimisticTickets() {
  const prefetchTicketDetails = (ticketId: string) => {
    // Prefetch dados do ticket específico
    fetch(`/api/tickets/${ticketId}`, {
      priority: 'low',
    }).catch(() => {
      // Ignore erros de prefetch
    });
  };

  const prefetchTicketList = () => {
    // Prefetch lista atualizada
    fetch('/api/tickets?pageSize=50', {
      priority: 'low',
    }).catch(() => {
      // Ignore erros de prefetch
    });
  };

  return {
    prefetchTicketDetails,
    prefetchTicketList,
  };
}