import { Suspense } from 'react'
import { SubcategoriasClient } from './subcategorias-client'

export default function SubcategoriasPage() {
  return (
    <Suspense>
      <SubcategoriasClient />
    </Suspense>
  )
}
