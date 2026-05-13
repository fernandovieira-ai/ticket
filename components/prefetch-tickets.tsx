'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Prefetch de dados para acelerar a próxima navegação
export function PrefetchTickets() {
  const pathname = usePathname();

  useEffect(() => {
    // No dashboard ou em qualquer tela que não seja tickets, faz prefetch da lista
    if (pathname === '/painel/dashboard' || !pathname.includes('tickets')) {
      fetch('/api/tickets?pageSize=20').catch(() => {});
    }
    // Em tickets, faz prefetch de clientes (ação comum: abrir cliente)
    if (pathname.includes('/painel/tickets')) {
      fetch('/api/clientes?pageSize=50').catch(() => {});
    }
  }, [pathname]);

  return null;
}

// Hook para prefetch ao passar o mouse sobre um item
export function useOptimisticTickets() {
  const prefetchTicketDetails = (ticketId: string) => {
    fetch(`/api/tickets/${ticketId}`).catch(() => {});
  };

  const prefetchTicketList = () => {
    fetch('/api/tickets?pageSize=50').catch(() => {});
  };

  return { prefetchTicketDetails, prefetchTicketList };
}