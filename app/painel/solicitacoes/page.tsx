import { Suspense } from "react";
import { SolicitacoesClient } from "./solicitacoes-client";

export default function SolicitacoesPage() {
  return (
    <div
      className="-mx-6 -my-6 flex flex-col"
      style={{ height: "calc(100% + 3rem)" }}
    >
      {/* Cabeçalho da página */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-900">
          Solicitações Internas
        </h2>
        <p className="text-gray-400 text-xs mt-0.5">
          Solicitações entre departamentos e equipes internas
        </p>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="text-gray-400 text-sm p-6">Carregando...</div>
          }
        >
          <SolicitacoesClient />
        </Suspense>
      </div>
    </div>
  );
}
