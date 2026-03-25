import { Suspense } from "react";
import { TicketsClient } from "./tickets-client";

export default function TicketsPage() {
  return (
    <div className="h-full">
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
      <div className="h-[calc(100vh-10rem)]">
        <Suspense
          fallback={
            <div
              style={{
                color: "var(--color-text-muted)",
                fontSize: 13,
                padding: 24,
              }}
            >
              Carregando...
            </div>
          }
        >
          <TicketsClient />
        </Suspense>
      </div>
    </div>
  );
}
