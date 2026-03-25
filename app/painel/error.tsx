'use client'

export default function PainelError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <div className="p-8">
      <h2 className="text-red-600 font-bold text-lg mb-2">Erro no painel</h2>
      <pre className="text-sm bg-red-50 border border-red-200 p-4 rounded overflow-auto">
        {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
    </div>
  )
}
