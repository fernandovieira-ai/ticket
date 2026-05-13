import { ReactNode } from 'react';

interface IntranetLayoutProps {
  children: ReactNode;
}

// Layout específico para módulos da intranet (se necessário customização futura)
// Por enquanto, usa o layout padrão do painel
export default function IntranetLayout({ children }: IntranetLayoutProps) {
  return (
    <div className="intranet-wrapper">
      {/* Usa o mesmo layout do sistema de tickets */}
      {children}
    </div>
  );
}