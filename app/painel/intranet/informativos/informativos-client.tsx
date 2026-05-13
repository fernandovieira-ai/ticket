"use client";

import { useState } from "react";
import { FileText, Plus, Pencil, Trash2, Calendar, Clock } from "lucide-react";
import { NovoInformativoModal } from "./novo-informativo-modal";
import { EditarInformativoModal } from "./editar-informativo-modal";

export interface Informativo {
  id: number;
  titulo: string;
  descricao: string;
  dta_validade: string | null;
  criado_em: string;
}

interface Props {
  initialInformativos: Informativo[];
}

export function InformativosClient({ initialInformativos }: Props) {
  const [informativos, setInformativos] = useState<Informativo[]>(initialInformativos);
  const [modalNovo, setModalNovo] = useState(false);
  const [editando, setEditando] = useState<Informativo | null>(null);
  const [excluindo, setExcluindo] = useState<number | null>(null);

  async function recarregar() {
    try {
      const res = await fetch("/api/intranet/informativos");
      if (res.ok) setInformativos(await res.json());
    } catch {}
  }

  async function handleExcluir(id: number) {
    if (!confirm("Deseja excluir este informativo?")) return;
    setExcluindo(id);
    try {
      const res = await fetch(`/api/intranet/informativos/${id}`, { method: "DELETE" });
      if (res.ok) setInformativos((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setExcluindo(null);
    }
  }

  function statusInfo(dta: string | null) {
    if (!dta) return { label: "Permanente", color: "#6b7280", bg: "#f3f4f6" };
    const validade = new Date(dta + "T00:00:00");
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diff = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: "Expirado", color: "#dc2626", bg: "#fee2e2" };
    if (diff <= 7) return { label: "Expira em breve", color: "#d97706", bg: "#fef3c7" };
    return { label: "Ativo", color: "#16a34a", bg: "#dcfce7" };
  }

  return (
    <div className="container mx-auto p-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, #0E1326 0%, #1a2540 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(14,19,38,0.3)",
            }}
          >
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
              Informativos
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Comunicados e informativos internos
            </p>
          </div>
        </div>

        <button
          onClick={() => setModalNovo(true)}
          className="btn-novo-plantao"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Informativo
        </button>
      </div>

      {/* Lista */}
      {informativos.length === 0 ? (
        <div
          style={{
            backgroundColor: "var(--color-bg-primary)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 14,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <FileText className="h-12 w-12 mx-auto mb-3" style={{ color: "var(--color-text-muted)" }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
            Nenhum informativo cadastrado
          </p>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Clique em &quot;Novo Informativo&quot; para começar
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {informativos.map((inf) => {
            const status = statusInfo(inf.dta_validade);
            return (
              <div
                key={inf.id}
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                {/* Conteúdo */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {inf.titulo}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: status.color,
                        backgroundColor: status.bg,
                        padding: "2px 8px",
                        borderRadius: 20,
                      }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p
                    className="informativo-descricao"
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.6,
                      marginBottom: 8,
                    }}
                    dangerouslySetInnerHTML={{ __html: inf.descricao }}
                  />
                  <div className="flex items-center gap-4">
                    {inf.dta_validade && (
                      <span
                        className="flex items-center gap-1"
                        style={{ fontSize: 11, color: "var(--color-text-muted)" }}
                      >
                        <Calendar className="w-3 h-3" />
                        Válido até {new Date(inf.dta_validade + "T00:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    <span
                      className="flex items-center gap-1"
                      style={{ fontSize: 11, color: "var(--color-text-muted)" }}
                    >
                      <Clock className="w-3 h-3" />
                      {new Date(inf.criado_em).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditando(inf)}
                    title="Editar"
                    style={{
                      background: "var(--color-bg-secondary)",
                      border: "0.5px solid var(--color-border)",
                      borderRadius: 7,
                      padding: "6px 8px",
                      cursor: "pointer",
                      color: "var(--color-text-secondary)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleExcluir(inf.id)}
                    disabled={excluindo === inf.id}
                    title="Excluir"
                    style={{
                      background: "#fee2e2",
                      border: "0.5px solid #fca5a5",
                      borderRadius: 7,
                      padding: "6px 8px",
                      cursor: "pointer",
                      color: "#dc2626",
                      display: "flex",
                      alignItems: "center",
                      opacity: excluindo === inf.id ? 0.6 : 1,
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo */}
      {modalNovo && (
        <NovoInformativoModal
          onClose={() => setModalNovo(false)}
          onSuccess={() => { setModalNovo(false); recarregar(); }}
        />
      )}

      {/* Modal Editar */}
      {editando && (
        <EditarInformativoModal
          informativo={editando}
          onClose={() => setEditando(null)}
          onSuccess={() => { setEditando(null); recarregar(); }}
        />
      )}
    </div>
  );
}
