"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Pencil, Trash2, Plus, X } from "lucide-react";

interface DtefItem {
  id: number;
  cnpj: string;
  loja: string | null;
  senha: string | null;
  observacoes: string | null;
}

function formatarCNPJ(cnpj: string) {
  const d = cnpj.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return cnpj;
}

interface ModalFormProps {
  item: DtefItem | null;
  onClose: () => void;
  onSalvo: (item: DtefItem) => void;
}

function ModalForm({ item, onClose, onSalvo }: ModalFormProps) {
  const [form, setForm] = useState({
    cnpj: item?.cnpj ?? "",
    loja: item?.loja ?? "",
    senha: item?.senha ?? "",
    observacoes: item?.observacoes ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!form.cnpj) { setErro("CNPJ é obrigatório"); return; }
    setSalvando(true);
    setErro("");
    try {
      const url = item ? `/api/intranet/dtef/${item.id}` : "/api/intranet/dtef";
      const method = item ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setErro(data.error ?? "Erro ao salvar");
        return;
      }
      onSalvo(await res.json());
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 540, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #4c1d95, #6d28d9)", color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "12px 12px 0 0" }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{item ? "Editar Senha DTEF" : "Nova Senha DTEF"}</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {[
            { label: "CNPJ *", key: "cnpj", placeholder: "00.000.000/0000-00" },
            { label: "Nome da Loja", key: "loja", placeholder: "" },
            { label: "Senha", key: "senha", placeholder: "" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{f.label}</label>
              <input
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
          ))}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Observações</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={3}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", fontSize: 14, boxSizing: "border-box", resize: "vertical" }}
            />
          </div>

          {erro && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{erro}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={salvar}
              disabled={salvando}
              style={{ flex: 1, background: "linear-gradient(135deg, #4c1d95, #6d28d9)", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: salvando ? 0.7 : 1 }}
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={onClose}
              style={{ flex: 1, background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DtefClient({ inicial }: { inicial: DtefItem[] }) {
  const [lista, setLista] = useState<DtefItem[]>(inicial);
  const [busca, setBusca] = useState("");
  const [senhasVisiveis, setSenhasVisiveis] = useState<Set<number>>(new Set());
  const [copiados, setCopiados] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<"novo" | DtefItem | null>(null);
  const [deletando, setDeletando] = useState<number | null>(null);

  function toggleSenha(id: number) {
    setSenhasVisiveis(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function copiarSenha(item: DtefItem) {
    if (!item.senha) return;
    await navigator.clipboard.writeText(item.senha);
    setCopiados(prev => new Set(prev).add(item.id));
    setTimeout(() => setCopiados(prev => { const s = new Set(prev); s.delete(item.id); return s; }), 1500);
  }

  async function excluir(id: number) {
    if (!confirm("Excluir esta senha DTEF?")) return;
    setDeletando(id);
    try {
      await fetch(`/api/intranet/dtef/${id}`, { method: "DELETE" });
      setLista(prev => prev.filter(i => i.id !== id));
    } finally {
      setDeletando(null);
    }
  }

  function onSalvo(item: DtefItem) {
    setLista(prev => {
      const idx = prev.findIndex(i => i.id === item.id);
      if (idx >= 0) { const l = [...prev]; l[idx] = item; return l; }
      return [...prev, item];
    });
    setModal(null);
  }

  const filtrados = lista.filter(i => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      i.cnpj.includes(q) ||
      (i.loja ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 10 }}>
          🔒 Senhas DTEF
        </h1>
        <button
            onClick={() => setModal("novo")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #4c1d95, #2d0072)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            <Plus size={14} /> Nova Senha
          </button>
      </div>

      {/* Busca */}
      <div style={{ background: "#fff", border: "0.5px solid var(--color-border)", borderRadius: 12, padding: "14px 18px", marginBottom: 28 }}>
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Pesquisar por CNPJ ou nome da loja..."
          style={{ width: "100%", border: "none", outline: "none", fontSize: 14, color: "var(--color-text-primary)", background: "transparent", boxSizing: "border-box" }}
        />
      </div>

      {/* Cards */}
      {filtrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)", fontSize: 14 }}>
          Nenhuma senha DTEF encontrada
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {filtrados.map(item => (
            <div
              key={item.id}
              style={{ background: "#fff", border: "0.5px solid var(--color-border)", borderRadius: 12, padding: "18px 20px" }}
            >
              {/* Nome + ações */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.3 }}>
                  {item.loja ?? "—"}
                </h3>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 8 }}>
                  <button
                    onClick={() => setModal(item)}
                    title="Editar"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#f59e0b", padding: 2 }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => excluir(item.id)}
                    disabled={deletando === item.id}
                    title="Excluir"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2, opacity: deletando === item.id ? 0.5 : 1 }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* CNPJ */}
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9", textTransform: "uppercase", letterSpacing: "0.04em" }}>CNPJ:</span>
                <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 2 }}>{formatarCNPJ(item.cnpj)}</div>
              </div>

              {/* Senha */}
              <div style={{ background: "#f5f3ff", borderRadius: 8, padding: "10px 14px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9", textTransform: "uppercase", letterSpacing: "0.04em" }}>SENHA:</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ flex: 1, fontFamily: "monospace", fontSize: 15, letterSpacing: senhasVisiveis.has(item.id) ? 1 : 3, color: "#1f2937" }}>
                    {senhasVisiveis.has(item.id) ? (item.senha ?? "—") : "• • • • • • • • • • • • • •"}
                  </span>
                  <button
                    onClick={() => toggleSenha(item.id)}
                    title={senhasVisiveis.has(item.id) ? "Ocultar" : "Ver senha"}
                    style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6b7280", flexShrink: 0 }}
                  >
                    {senhasVisiveis.has(item.id) ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button
                    onClick={() => copiarSenha(item)}
                    title="Copiar senha"
                    style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: copiados.has(item.id) ? "#16a34a" : "#6b7280", flexShrink: 0 }}
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>

              {/* Observações */}
              {item.observacoes && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                  {item.observacoes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <ModalForm
          item={modal === "novo" ? null : modal}
          onClose={() => setModal(null)}
          onSalvo={onSalvo}
        />
      )}
    </div>
  );
}
