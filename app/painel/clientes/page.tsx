import { Suspense } from 'react'
import { ClientesClient } from './clientes-client'

export default function ClientesPage() {
  return (
    <div className="h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white -mx-6 -mt-6 mb-0">
        <h2 className="text-base font-semibold text-gray-900">Clientes</h2>
        <p className="text-gray-400 text-xs mt-0.5">Base de clientes e contatos</p>
      </div>
      <div className="h-[calc(100vh-10rem)]">
        <Suspense fallback={<div className="text-gray-400 text-sm p-6">Carregando...</div>}>
          <ClientesClient />
        </Suspense>
      </div>
    </div>
  )
}
