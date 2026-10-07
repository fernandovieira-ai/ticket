import { Suspense } from "react";
import { SaasClient } from "./saas-client";

export default function SaasPage() {
  return (
    <div className="h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white -mx-6 -mt-6 mb-0">
        <h2 className="text-base font-semibold text-gray-900">SaaS</h2>
        <p className="text-gray-400 text-xs mt-0.5">
          Liberação de clientes do ERP (instâncias e tokens de API)
        </p>
      </div>
      <div className="h-[calc(100vh-10rem)]">
        <Suspense fallback={<div className="text-gray-400 text-sm p-6">Carregando...</div>}>
          <SaasClient />
        </Suspense>
      </div>
    </div>
  );
}
