"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log do erro para monitoramento
    console.error("Application error:", error);

    // Se for erro de Server Action não encontrada, recarrega a página
    if (
      error.message.includes("Failed to find Server Action") ||
      error.message.includes("ECONNRESET")
    ) {
      console.log("Detectado erro de deploy - recarregando página...");
      // Aguarda 2 segundos antes de recarregar para evitar loop infinito
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }, [error]);

  const isServerActionError = error.message.includes("Failed to find Server Action");
  const isConnectionError = error.message.includes("ECONNRESET") ||
                           error.message.includes("Connection terminated");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isServerActionError || isConnectionError
                ? "Nova versão disponível"
                : "Algo deu errado"}
            </h2>
            <p className="text-sm text-gray-500">
              {isServerActionError || isConnectionError
                ? "Atualizando automaticamente..."
                : "Ocorreu um erro inesperado"}
            </p>
          </div>
        </div>

        {!isServerActionError && !isConnectionError && (
          <div className="mb-6 rounded-md bg-gray-50 p-4">
            <p className="text-sm text-gray-700">
              {error.message || "Erro desconhecido"}
            </p>
            {error.digest && (
              <p className="mt-2 text-xs text-gray-500">
                ID do erro: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Tentar novamente
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Voltar ao início
          </button>
        </div>

        {(isServerActionError || isConnectionError) && (
          <p className="mt-4 text-center text-xs text-gray-500">
            A página será recarregada automaticamente em alguns segundos...
          </p>
        )}
      </div>
    </div>
  );
}
