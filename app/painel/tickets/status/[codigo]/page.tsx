import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TicketsClient } from "../../tickets-client";

const STATUS_MAP: Record<string, { label: string; descricao: string }> = {
  aberto:             { label: "Aberto",             descricao: "Tickets recém-criados, aguardando atribuição" },
  em_andamento:       { label: "Em Andamento",       descricao: "Tickets atribuídos a um agente, em atendimento" },
  aguardando_cliente: { label: "Aguardando Cliente", descricao: "Tickets aguardando retorno do cliente" },
  resolvido:          { label: "Resolvido",          descricao: "Tickets resolvidos pelo operador" },
  cancelado:          { label: "Cancelado",          descricao: "Tickets cancelados pelo cliente ou operador" },
  finalizado:         { label: "Finalizado",         descricao: "Tickets encerrados definitivamente" },
};

interface Props {
  params: Promise<{ codigo: string }>;
}

export default async function TicketsPorStatusPage({ params }: Props) {
  const { codigo } = await params;
  const info = STATUS_MAP[codigo];
  if (!info) notFound();

  return (
    <div className="h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white -mx-6 -mt-6 mb-0">
        <h2 className="text-base font-semibold text-gray-900">{info.label}</h2>
        <p className="text-gray-400 text-xs mt-0.5">{info.descricao}</p>
      </div>
      <div className="h-[calc(100vh-10rem)]">
        <Suspense fallback={<div className="text-gray-400 text-sm p-6">Carregando...</div>}>
          <TicketsClient statusCodigo={codigo} />
        </Suspense>
      </div>
    </div>
  );
}
