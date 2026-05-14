"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Globe, ArrowLeft, Eye, EyeOff, Copy, Pencil, Trash2, Plus, X } from "lucide-react";
import Link from "next/link";
import type { GrupoContrato } from "./page";

// ─── types ────────────────────────────────────────────────────────────────────
interface Hospedagem {
  id: number;
  cod_grupo: number;
  nom_base: string;
  nom_host: string;
  nom_usuario: string | null;
  sen_senha: string | null;
  senha_decrypted: string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function formatarCNPJ(cnpj: string | null) {
  if (!cnpj) return "";
  const d = cnpj.replace(/\D/g, "");
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return cnpj;
}

function formatarTelefone(tel: string | null) {
  if (!tel) return "";
  const d = tel.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return tel;
}

// ─── Modal Hospedagem ─────────────────────────────────────────────────────────
function ModalHospedagem({
  grupo,
  onClose,
}: {
  grupo: GrupoContrato;
  onClose: () => void;
}) {
  const [lista, setLista] = useState<Hospedagem[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [senhasVisiveis, setSenhasVisiveis] = useState<Set<number>>(new Set());
  const [copiados, setCopiados] = useState<Set<number>>(new Set());
  const [editando, setEditando] = useState<Hospedagem | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [form, setForm] = useState({ nom_base: "", nom_host: "", nom_usuario: "", sen_senha: "" });
  const [salvando, setSalvando] = useState(false);
  const [deletando, setDeletando] = useState<number | null>(null);

  // Carregar na montagem
  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/intranet/hospedagem?cod_grupo=${grupo.cod_grupo}`);
      if (res.ok) setLista(await res.json());
    } catch { /* silently ignore */ }
    setCarregado(true);
  }, [grupo.cod_grupo]);

  if (!carregado) { carregar(); }

  function toggleSenha(id: number) {
    setSenhasVisiveis(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  async function copiarSenha(item: Hospedagem) {
    if (!item.senha_decrypted) return;
    await navigator.clipboard.writeText(item.senha_decrypted);
    setCopiados(prev => new Set(prev).add(item.id));
    setTimeout(() => setCopiados(prev => { const s = new Set(prev); s.delete(item.id); return s; }), 1500);
  }

  function abrirAdicionar() {
    setForm({ nom_base: "", nom_host: "", nom_usuario: "", sen_senha: "" });
    setEditando(null);
    setAdicionando(true);
  }

  function abrirEditar(item: Hospedagem) {
    setForm({
      nom_base: item.nom_base,
      nom_host: item.nom_host,
      nom_usuario: item.nom_usuario ?? "",
      sen_senha: item.senha_decrypted ?? "",
    });
    setEditando(item);
    setAdicionando(true);
  }

  async function salvar() {
    if (!form.nom_base || !form.nom_host) return;
    setSalvando(true);
    try {
      if (editando) {
        const res = await fetch(`/api/intranet/hospedagem/${editando.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, cod_grupo: grupo.cod_grupo }),
        });
        if (res.ok) {
          const updated: Hospedagem = await res.json();
          setLista(prev => prev.map(i => i.id === updated.id ? updated : i));
        }
      } else {
        const res = await fetch("/api/intranet/hospedagem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, cod_grupo: grupo.cod_grupo }),
        });
        if (res.ok) {
          const novo: Hospedagem = await res.json();
          setLista(prev => [...prev, novo]);
        }
      }
      setAdicionando(false);
      setEditando(null);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number) {
    if (!confirm("Excluir esta hospedagem?")) return;
    setDeletando(id);
    try {
      await fetch(`/api/intranet/hospedagem/${id}`, { method: "DELETE" });
      setLista(prev => prev.filter(i => i.id !== id));
    } finally {
      setDeletando(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, width: "100%", maxWidth: 720,
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #4c1d95, #6d28d9)",
          color: "#fff", padding: "16px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderRadius: "12px 12px 0 0",
        }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Gerenciar Hospedagem</span>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", color: "#fff", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {/* Subgrupo nome */}
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
            Grupo: <strong>{grupo.des_grupo}</strong>
          </div>

          {/* Formulário nova/editar */}
          {adicionando ? (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1f2937" }}>
                {editando ? "Editar Hospedagem" : "Nova Hospedagem"}
              </h3>
              <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", marginBottom: 16 }} />
              {[
                { label: "Base: *", key: "nom_base", placeholder: "" },
                { label: "Host: *", key: "nom_host", placeholder: "" },
                { label: "Usuário:", key: "nom_usuario", placeholder: "" },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "#374151", fontWeight: 500 }}>{f.label}</label>
                  <input
                    value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", fontSize: 14, boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "#374151", fontWeight: 500 }}>Senha:</label>
                <input
                  type="text"
                  value={form.sen_senha}
                  placeholder="Senha será criptografada"
                  onChange={e => setForm(prev => ({ ...prev, sen_senha: e.target.value }))}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", fontSize: 14, boxSizing: "border-box" }}
                />
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>A senha será armazenada de forma criptografada. Administradores podem visualizar e copiar a senha.</p>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  onClick={salvar}
                  disabled={salvando || !form.nom_base || !form.nom_host}
                  style={{ flex: 1, background: "linear-gradient(135deg, #4c1d95, #6d28d9)", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: (salvando || !form.nom_base || !form.nom_host) ? 0.6 : 1 }}
                >
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
                <button
                  onClick={() => { setAdicionando(false); setEditando(null); }}
                  style={{ flex: 1, background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {/* Tabela */}
          {!carregado ? (
            <div style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>Carregando...</div>
          ) : lista.length === 0 && !adicionando ? (
            <div style={{ textAlign: "center", padding: 32, color: "#6b7280", fontSize: 14 }}>
              Nenhuma hospedagem cadastrada
            </div>
          ) : lista.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #4c1d95, #6d28d9)", color: "#fff" }}>
                  {["BASE", "HOST", "USUÁRIO", "SENHA", "AÇÕES"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((item, idx) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: "#1f2937" }}>{item.nom_base}</td>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: "#374151" }}>{item.nom_host}</td>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: "#374151" }}>{item.nom_usuario ?? "—"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: "#374151", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "monospace", letterSpacing: 2 }}>
                        {senhasVisiveis.has(item.id) ? (item.senha_decrypted ?? "—") : "••••••••"}
                      </span>
                      <button
                        onClick={() => toggleSenha(item.id)}
                        title={senhasVisiveis.has(item.id) ? "Ocultar" : "Ver senha"}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 2 }}
                      >
                        {senhasVisiveis.has(item.id) ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button
                        onClick={() => copiarSenha(item)}
                        title="Copiar senha"
                        style={{ background: "none", border: "none", cursor: "pointer", color: copiados.has(item.id) ? "#16a34a" : "#6b7280", padding: 2 }}
                      >
                        <Copy size={15} />
                      </button>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => abrirEditar(item)}
                          title="Editar"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#f59e0b", padding: 2 }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => excluir(item.id)}
                          disabled={deletando === item.id}
                          title="Excluir"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 2, opacity: deletando === item.id ? 0.5 : 1 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            {!adicionando && (
              <button
                onClick={abrirAdicionar}
                style={{ background: "linear-gradient(135deg, #4c1d95, #6d28d9)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <Plus size={14} /> Nova Hospedagem
              </button>
            )}
            <button
              onClick={onClose}
              style={{ marginLeft: "auto", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ContratosClient({ grupos }: { grupos: GrupoContrato[] }) {
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busca, setBusca] = useState("");
  const [modalHospedagem, setModalHospedagem] = useState<GrupoContrato | null>(null);

  function toggleGrupo(cod: number) {
    setAbertos(prev => {
      const s = new Set(prev);
      s.has(cod) ? s.delete(cod) : s.add(cod);
      return s;
    });
  }

  const gruposFiltrados = grupos.filter(grupo => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    if (filtroTipo === "grupo") return grupo.des_grupo.toLowerCase().includes(q);
    if (filtroTipo === "cnpj") return grupo.empresas.some(e => e.num_cnpj_cpf?.includes(q));
    if (filtroTipo === "nome") return grupo.empresas.some(e => e.nom_pessoa.toLowerCase().includes(q));
    if (filtroTipo === "tipoItem") return grupo.empresas.some(e => e.servicos.some(s => s.des_item.toLowerCase().includes(q)));
    return (
      grupo.des_grupo.toLowerCase().includes(q) ||
      grupo.empresas.some(e =>
        e.nom_pessoa.toLowerCase().includes(q) ||
        (e.num_cnpj_cpf ?? "").includes(q) ||
        e.servicos.some(s => s.des_item.toLowerCase().includes(q))
      )
    );
  });

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
          📋 Contratos
        </h1>
      </div>

      {/* Filtros */}
      <div style={{
        background: "var(--color-bg-secondary, #fff)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 12, padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        flexWrap: "wrap",
      }}>
        <label style={{ fontSize: 13, color: "var(--color-text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
          Filtrar por:
        </label>
        <select
          value={filtroTipo}
          onChange={e => { setFiltroTipo(e.target.value); setBusca(""); }}
          style={{
            border: "0.5px solid var(--color-border)", borderRadius: 8,
            padding: "6px 10px", fontSize: 13, background: "var(--color-bg-primary)",
            color: "var(--color-text-primary)", cursor: "pointer",
          }}
        >
          <option value="todos">Todos</option>
          <option value="grupo">Grupo</option>
          <option value="cnpj">CNPJ</option>
          <option value="nome">Nome do Cliente</option>
          <option value="tipoItem">Tipo de Contrato</option>
        </select>
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Digite para pesquisar..."
          style={{
            flex: 1, minWidth: 200, border: "0.5px solid var(--color-border)",
            borderRadius: 8, padding: "6px 12px", fontSize: 13,
            background: "var(--color-bg-primary)", color: "var(--color-text-primary)",
          }}
        />
        <button
          onClick={() => { setBusca(""); setFiltroTipo("todos"); }}
          style={{
            background: "#dc2626", color: "#fff", border: "none",
            borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          ✕ Limpar
        </button>
      </div>

      {/* Lista de grupos */}
      {gruposFiltrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)", fontSize: 14 }}>
          Nenhum contrato encontrado
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {gruposFiltrados.map(grupo => {
            const aberto = abertos.has(grupo.cod_grupo);
            return (
              <div key={grupo.cod_grupo} style={{ border: "0.5px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
                {/* Cabeçalho do grupo */}
                <div
                  onClick={() => toggleGrupo(grupo.cod_grupo)}
                  style={{
                    background: "linear-gradient(135deg, #4c1d95, #6d28d9)",
                    color: "#fff", padding: "12px 18px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer", userSelect: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}>
                    {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {grupo.des_grupo}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                      {grupo.empresas.length} {grupo.empresas.length === 1 ? "empresa" : "empresas"}
                    </span>
                    {grupo.temHospedagem && (
                      <button
                        onClick={e => { e.stopPropagation(); setModalHospedagem(grupo); }}
                        style={{
                          background: "#fff", color: "#4c1d95",
                          border: "none", borderRadius: 20, padding: "4px 12px",
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 5,
                        }}
                      >
                        <Globe size={12} /> Hospedagem
                      </button>
                    )}
                  </div>
                </div>

                {/* Empresas */}
                {aberto && (
                  <div style={{
                    background: "var(--color-bg-primary)", padding: "16px 18px",
                    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12,
                  }}>
                    {grupo.empresas.map(empresa => (
                      <div key={empresa.cod_pessoa} style={{ border: "0.5px solid var(--color-border)", borderRadius: 10, padding: "14px 16px", background: "var(--color-bg-secondary)" }}>
                        <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>
                          {empresa.nom_pessoa}
                        </h4>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>
                          <strong>CNPJ:</strong> {formatarCNPJ(empresa.num_cnpj_cpf)}
                        </div>
                        {empresa.num_telefone_1 && (
                          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                            <strong>Tel:</strong> {formatarTelefone(empresa.num_telefone_1)}
                          </div>
                        )}
                        {empresa.servicos.length > 0 && (
                          <>
                            <hr style={{ border: "none", borderTop: "0.5px solid var(--color-border)", margin: "8px 0" }} />
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                              Serviços Contratados:
                            </div>
                            {empresa.servicos.map((s, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 3 }}>
                                <span style={{ color: "#16a34a", fontWeight: 700, flexShrink: 0 }}>✓</span>
                                {s.des_item}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Hospedagem */}
      {modalHospedagem && (
        <ModalHospedagem
          grupo={modalHospedagem}
          onClose={() => setModalHospedagem(null)}
        />
      )}
    </div>
  );
}
