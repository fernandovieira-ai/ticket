"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Informativo } from "./informativos-client";

interface Props {
  informativo: Informativo;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditarInformativoModal({ informativo, onClose, onSuccess }: Props) {
  const [titulo, setTitulo] = useState(informativo.titulo);
  const [descricao, setDescricao] = useState(informativo.descricao);
  const [dtaValidade, setDtaValidade] = useState(
    informativo.dta_validade ? informativo.dta_validade.split("T")[0] : ""
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSalvar() {
    if (!titulo.trim() || !descricao.trim()) {
      setErro("Título e descrição são obrigatórios.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/intranet/informativos/${informativo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, descricao, dta_validade: dtaValidade || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErro(data.error || "Erro ao salvar.");
        return;
      }
      onSuccess();
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--color-bg-primary)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "0.5px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
            Editar Informativo
          </p>
          <button
            onClick={onClose}
            style={{
              background: "var(--color-bg-secondary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 6,
              padding: 4,
              cursor: "pointer",
              color: "var(--color-text-muted)",
              display: "flex",
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {erro && (
            <p style={{ fontSize: 13, color: "#dc2626", background: "#fee2e2", padding: "8px 12px", borderRadius: 8 }}>
              {erro}
            </p>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
              Título *
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                border: "0.5px solid var(--color-border)",
                background: "var(--color-bg-secondary)",
                color: "var(--color-text-primary)",
                fontSize: 14, outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
              Descrição *
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={5}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                border: "0.5px solid var(--color-border)",
                background: "var(--color-bg-secondary)",
                color: "var(--color-text-primary)",
                fontSize: 14, outline: "none", resize: "vertical",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
              Válido até (opcional)
            </label>
            <input
              type="date"
              value={dtaValidade}
              onChange={(e) => setDtaValidade(e.target.value)}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                border: "0.5px solid var(--color-border)",
                background: "var(--color-bg-secondary)",
                color: "var(--color-text-primary)",
                fontSize: 14, outline: "none",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "0.5px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border)",
              background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "#0E1326", color: "white",
              fontSize: 13, fontWeight: 600, cursor: salvando ? "not-allowed" : "pointer",
              opacity: salvando ? 0.7 : 1,
            }}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
