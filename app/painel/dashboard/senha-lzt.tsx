"use client";

import { useState } from "react";
import { Copy, Check, X } from "lucide-react";

// Algoritmo portado de C:\Linx\cliente\digitalrf\projeto\intranet\public\js\senha-diaria.js
function gerarSenhaDiaria(data: Date = new Date()): string {
  const mes = data.getMonth() + 1;
  let diaDaSemana = data.getDay(); // 0 = Domingo
  const dia = data.getDate();
  const ano = data.getFullYear() % 100;

  // Ajustar para segunda-feira = 0
  diaDaSemana = diaDaSemana === 0 ? 6 : diaDaSemana - 1;

  const parte1 = String(mes + diaDaSemana).padStart(2, "0");
  const parte2 = String(ano).padStart(2, "0");
  const parte3 = String(dia + mes + ano).padStart(2, "0");
  const parte4 = String(diaDaSemana * diaDaSemana + dia).padStart(2, "0");

  return parte1 + parte2 + parte3 + parte4;
}

function gerarSenhasProximosDias(quantidade = 7) {
  const hoje = new Date();
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return Array.from({ length: quantidade }, (_, i) => {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + i);
    return {
      data: data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      diaSemana: diasSemana[data.getDay()],
      senha: gerarSenhaDiaria(data),
      ehHoje: i === 0,
    };
  });
}

function formatarData(data: Date): string {
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${diasSemana[data.getDay()]} ${dia}/${mes}`;
}

export function SenhaLZT() {
  const hoje = new Date();
  const senhaHoje = gerarSenhaDiaria(hoje);
  const dataFormatada = formatarData(hoje);

  const [copiado, setCopiado] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  function copiar() {
    navigator.clipboard.writeText(senhaHoje).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const proximasSenhas = gerarSenhasProximosDias(7);

  return (
    <>
      {/* Card Senha LZT — layout vertical para caber no painel lateral */}
      <div
        style={{
          background: "linear-gradient(135deg, #3b1fa3 0%, #6d28d9 50%, #7c3aed 100%)",
          borderRadius: 14,
          padding: "14px 16px",
        }}
      >
        {/* Título */}
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.8)",
            marginBottom: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          🔒 Senha LZT de Hoje
        </p>

        {/* Linha senha + copiar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          {/* Display digital */}
          <div
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              padding: "6px 10px",
              display: "flex",
              gap: 4,
              alignItems: "center",
              flex: 1,
              justifyContent: "center",
            }}
          >
            {senhaHoje.split("").map((digit, i) => (
              <span
                key={i}
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#ffffff",
                  lineHeight: 1,
                }}
              >
                {digit}
              </span>
            ))}
          </div>

          {/* Botão copiar */}
          <button
            onClick={copiar}
            title="Copiar senha"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              padding: "7px 8px",
              cursor: "pointer",
              color: "white",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {copiado ? (
              <Check className="w-4 h-4 text-green-300" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Rodapé: data + botão próximos dias */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              fontWeight: 500,
            }}
          >
            {dataFormatada}
          </span>
          <button
            onClick={() => setModalAberto(true)}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 6,
              padding: "5px 10px",
              cursor: "pointer",
              color: "rgba(255,255,255,0.9)",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Ver próximos 7 dias →
          </button>
        </div>
      </div>

      {/* Modal próximos 7 dias */}
      {modalAberto && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalAberto(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--color-bg-primary)",
              borderRadius: 14,
              width: "100%",
              maxWidth: 480,
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            {/* Header do modal */}
            <div
              style={{
                background: "linear-gradient(135deg, #3b1fa3 0%, #7c3aed 100%)",
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <p style={{ color: "white", fontWeight: 600, fontSize: 15 }}>
                🔒 Senhas LZT – Próximos 7 Dias
              </p>
              <button
                onClick={() => setModalAberto(false)}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  borderRadius: 6,
                  padding: 4,
                  cursor: "pointer",
                  color: "white",
                  display: "flex",
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de senhas */}
            <div style={{ padding: 16 }} className="space-y-2">
              {proximasSenhas.map((item) => (
                <div
                  key={item.data}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: 8,
                    backgroundColor: item.ehHoje
                      ? "rgba(109,40,217,0.1)"
                      : "var(--color-bg-secondary)",
                    border: item.ehHoje
                      ? "1px solid rgba(109,40,217,0.3)"
                      : "0.5px solid var(--color-border)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-muted)",
                        minWidth: 28,
                      }}
                    >
                      {item.diaSemana}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {item.data}
                    </span>
                    {item.ehHoje && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#7c3aed",
                          background: "rgba(109,40,217,0.15)",
                          padding: "1px 6px",
                          borderRadius: 4,
                          letterSpacing: "0.05em",
                        }}
                      >
                        HOJE
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: "'Courier New', monospace",
                      fontSize: 16,
                      fontWeight: 700,
                      color: item.ehHoje ? "#6d28d9" : "var(--color-text-primary)",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {item.senha}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
