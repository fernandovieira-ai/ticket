import { Suspense } from 'react'
import { UsuariosServer } from './usuarios-server'

export default function UsuariosPage() {
  return (
    <div className="h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white -mx-6 -mt-6 mb-0">
        <h2 className="text-base font-semibold text-gray-900">Usuários</h2>
        <p className="text-gray-400 text-xs mt-0.5">Operadores e administradores do sistema</p>
      </div>
      <div className="h-[calc(100vh-10rem)]">
        <Suspense fallback={<div className="text-gray-400 text-sm p-6">Carregando...</div>}>
          <UsuariosServer />
        </Suspense>
      </div>
    </div>
  )
}
