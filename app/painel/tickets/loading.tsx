// Loading específico para a página de tickets - mais rápido que Suspense
export default function TicketsLoading() {
  return (
    <div className="h-full">
      {/* Header estático - sem loading */}
      <div
        className="-mx-6 -mt-6 mb-0"
        style={{
          padding: "14px 24px 14px",
          borderBottom: "0.5px solid var(--color-border)",
          backgroundColor: "var(--color-bg-primary)",
        }}
      >
        <h2
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.3px",
            lineHeight: 1.3,
          }}
        >
          Tickets
        </h2>
        <p
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          Gerencie todos os chamados de suporte
        </p>
      </div>

      {/* Skeleton otimizado - mais rápido de renderizar */}
      <div className="p-6 space-y-4">
        <div className="flex gap-4">
          <div className="h-10 w-64 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-100 rounded animate-pulse" />
        </div>

        {/* Skeleton mais leve - menos elementos */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-50 border rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}