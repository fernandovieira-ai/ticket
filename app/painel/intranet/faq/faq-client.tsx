"use client";

import { useState, useMemo, useRef } from "react";
import { HelpCircle, Plus, Search, Pencil, Trash2, ChevronDown, ChevronUp, X, ImagePlus, ImageOff } from "lucide-react";

export interface FaqItem {
  id: number;
  nom_sistema: string;
  des_assunto: string;
  des_erro: string | null;
  des_resolucao: string | null;
  usuario_cadastro: string | null;
  criado_em: string;
  tem_imagem: boolean;
}

interface Props {
  initialFaq: FaqItem[];
  sistemas: string[];
}

const FORM_VAZIO = { nom_sistema: "", des_assunto: "", des_erro: "", des_resolucao: "" };

const SISTEMA_CORES: Record<string, { bg: string; color: string }> = {};
const PALETA = [
  { bg: "#dbeafe", color: "#1d4ed8" },
  { bg: "#dcfce7", color: "#15803d" },
  { bg: "#fef9c3", color: "#854d0e" },
  { bg: "#f3e8ff", color: "#7c3aed" },
  { bg: "#fee2e2", color: "#b91c1c" },
  { bg: "#e0f2fe", color: "#0369a1" },
  { bg: "#fce7f3", color: "#be185d" },
  { bg: "#d1fae5", color: "#065f46" },
];
function corSistema(nome: string) {
  if (!SISTEMA_CORES[nome]) {
    const idx = Object.keys(SISTEMA_CORES).length % PALETA.length;
    SISTEMA_CORES[nome] = PALETA[idx];
  }
  return SISTEMA_CORES[nome];
}

export function FaqClient({ initialFaq, sistemas }: Props) {
  const [faq, setFaq] = useState<FaqItem[]>(initialFaq);
  const [busca, setBusca] = useState("");
  const [filtroSistema, setFiltroSistema] = useState<string>("todos");
  const [expandido, setExpandido] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<FaqItem | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [uploadandoImagem, setUploadandoImagem] = useState(false);
  const [removendoImagem, setRemovendoImagem] = useState<number | null>(null);
  const [imagensComErro, setImagensComErro] = useState<Set<number>>(new Set());
  const imagemInputRef = useRef<HTMLInputElement>(null);

  const sistemasDisponiveis = useMemo(() => {
    const set = new Set(faq.map((f) => f.nom_sistema));
    sistemas.forEach((s) => set.add(s));
    return Array.from(set).sort();
  }, [faq, sistemas]);

  const faqFiltrado = useMemo(() => {
    return faq.filter((item) => {
      const matchSistema = filtroSistema === "todos" || item.nom_sistema === filtroSistema;
      const q = busca.toLowerCase();
      const matchBusca =
        !q ||
        item.des_assunto.toLowerCase().includes(q) ||
        (item.des_erro ?? "").toLowerCase().includes(q) ||
        (item.des_resolucao ?? "").toLowerCase().includes(q) ||
        item.nom_sistema.toLowerCase().includes(q);
      return matchSistema && matchBusca;
    });
  }, [faq, busca, filtroSistema]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setImagemFile(null);
    setImagemPreview(null);
    setErro("");
    setModalAberto(true);
  }

  function abrirEditar(item: FaqItem) {
    setEditando(item);
    setForm({
      nom_sistema: item.nom_sistema,
      des_assunto: item.des_assunto,
      des_erro: item.des_erro ?? "",
      des_resolucao: item.des_resolucao ?? "",
    });
    setImagemFile(null);
    setImagemPreview(item.tem_imagem && !imagensComErro.has(item.id) ? `/api/intranet/faq/${item.id}/imagem?t=${Date.now()}` : null);
    setErro("");
    setModalAberto(true);
  }

  function handleImagemChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagemFile(file);
    setImagemPreview(URL.createObjectURL(file));
  }

  async function salvar() {
    if (!form.nom_sistema || !form.des_assunto) {
      setErro("Sistema e assunto são obrigatórios");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const url = editando ? `/api/intranet/faq/${editando.id}` : "/api/intranet/faq";
      const method = editando ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error ?? "Erro ao salvar"); return; }

      let novoItem: FaqItem = data;

      // Upload da imagem se selecionada
      if (imagemFile) {
        setUploadandoImagem(true);
        try {
          const fd = new FormData();
          fd.append("imagem", imagemFile);
          const imgRes = await fetch(`/api/intranet/faq/${data.id}/imagem`, { method: "POST", body: fd });
          if (imgRes.ok) {
            novoItem = { ...novoItem, tem_imagem: true };
          } else {
            const imgData = await imgRes.json().catch(() => ({}));
            setErro(imgData.error ?? "Erro ao salvar imagem");
            // Ainda fecha o modal, pois o texto foi salvo
          }
        } catch {
          setErro("Erro de conexão ao enviar imagem");
        } finally {
          setUploadandoImagem(false);
        }
      }

      if (editando) {
        setFaq((prev) => prev.map((f) => (f.id === editando.id ? novoItem : f)));
      } else {
        setFaq((prev) => [novoItem, ...prev]);
      }
      setModalAberto(false);
    } finally {
      setSalvando(false);
    }
  }

  async function removerImagem(id: number) {
    setRemovendoImagem(id);
    try {
      await fetch(`/api/intranet/faq/${id}/imagem`, { method: "DELETE" });
      setFaq((prev) => prev.map((f) => f.id === id ? { ...f, tem_imagem: false } : f));
      setImagensComErro((prev) => { const s = new Set(prev); s.delete(id); return s; });
      if (editando?.id === id) {
        setImagemFile(null);
        setImagemPreview(null);
      }
    } finally {
      setRemovendoImagem(null);
    }
  }

  async function excluir(id: number) {
    if (!confirm("Deseja excluir este FAQ?")) return;
    setExcluindo(id);
    try {
      await fetch(`/api/intranet/faq/${id}`, { method: "DELETE" });
      setFaq((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setExcluindo(null);
    }
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
              background: "linear-gradient(135deg, #7c3aed 0%, #9f5ff1 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
            }}
          >
            <HelpCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
              FAQ
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Base de conhecimento e soluções de problemas
            </p>
          </div>
        </div>
        <button onClick={abrirNovo} className="btn-novo-plantao">
          <Plus className="h-4 w-4 mr-2" />
          Novo FAQ
        </button>
      </div>

      {/* Filtros */}
      <div
        style={{
          backgroundColor: "var(--color-bg-primary)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 20,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Busca */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            type="text"
            placeholder="Buscar por assunto, problema ou solução..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: 36,
              paddingRight: 12,
              height: 36,
              border: "0.5px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--color-text-primary)",
              backgroundColor: "var(--color-bg-secondary)",
              outline: "none",
            }}
          />
        </div>
        {/* Filtro por sistema */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroSistema("todos")}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 20,
              border: "0.5px solid var(--color-border)",
              cursor: "pointer",
              backgroundColor: filtroSistema === "todos" ? "var(--color-brand)" : "var(--color-bg-secondary)",
              color: filtroSistema === "todos" ? "#fff" : "var(--color-text-secondary)",
            }}
          >
            Todos ({faq.length})
          </button>
          {sistemasDisponiveis.map((s) => {
            const cor = corSistema(s);
            const ativo = filtroSistema === s;
            return (
              <button
                key={s}
                onClick={() => setFiltroSistema(s)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 20,
                  border: `0.5px solid ${ativo ? cor.color : "var(--color-border)"}`,
                  cursor: "pointer",
                  backgroundColor: ativo ? cor.bg : "var(--color-bg-secondary)",
                  color: ativo ? cor.color : "var(--color-text-secondary)",
                }}
              >
                {s} ({faq.filter((f) => f.nom_sistema === s).length})
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista */}
      {faqFiltrado.length === 0 ? (
        <div
          style={{
            backgroundColor: "var(--color-bg-primary)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 14,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <HelpCircle className="h-12 w-12 mx-auto mb-3" style={{ color: "var(--color-text-muted)", opacity: 0.4 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
            Nenhum FAQ encontrado
          </p>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {busca || filtroSistema !== "todos" ? "Tente outros filtros" : "Clique em \"Novo FAQ\" para começar"}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {faqFiltrado.map((item) => {
            const aberto = expandido === item.id;
            const cor = corSistema(item.nom_sistema);
            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {/* Linha principal */}
                <div
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandido(aberto ? null : item.id)}
                >
                  {/* Badge sistema */}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 20,
                      backgroundColor: cor.bg,
                      color: cor.color,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.nom_sistema}
                  </span>

                  {/* Assunto */}
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      flex: 1,
                      minWidth: 0,
                    }}
                    className="truncate"
                  >
                    {item.des_assunto}
                  </span>

                  {/* Usuário + data */}
                  <span
                    style={{ fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0 }}
                    className="hidden sm:block"
                  >
                    {item.usuario_cadastro} · {new Date(item.criado_em).toLocaleDateString("pt-BR")}
                  </span>

                  {item.tem_imagem && !imagensComErro.has(item.id) && (
                    <span title="Possui imagem" style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
                      <ImagePlus size={13} />
                    </span>
                  )}

                  {/* Ações */}
                  <div
                    className="flex items-center gap-1"
                    style={{ flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => abrirEditar(item)}
                      title="Editar"
                      style={{
                        background: "var(--color-bg-secondary)",
                        border: "0.5px solid var(--color-border)",
                        borderRadius: 7,
                        padding: "5px 7px",
                        cursor: "pointer",
                        color: "var(--color-text-secondary)",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => excluir(item.id)}
                      disabled={excluindo === item.id}
                      title="Excluir"
                      style={{
                        background: "#fee2e2",
                        border: "0.5px solid #fca5a5",
                        borderRadius: 7,
                        padding: "5px 7px",
                        cursor: "pointer",
                        color: "#b91c1c",
                        display: "flex",
                        alignItems: "center",
                        opacity: excluindo === item.id ? 0.5 : 1,
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {aberto ? <ChevronUp size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />}
                </div>

                {/* Conteúdo expandido — texto de problema/solução + imagem */}
                {aberto && (
                  <div
                    style={{
                      borderTop: "0.5px solid var(--color-border)",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {item.des_erro && (
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          Problema
                        </p>
                        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                          {item.des_erro}
                        </p>
                      </div>
                    )}
                    {item.des_resolucao && (
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          Solução
                        </p>
                        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                          {item.des_resolucao}
                        </p>
                      </div>
                    )}

                    {/* Imagem — aparece dentro do accordion */}
                    {item.tem_imagem && !imagensComErro.has(item.id) && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/intranet/faq/${item.id}/imagem`}
                            alt="Imagem do FAQ"
                            onError={() =>
                              setImagensComErro((prev) => new Set([...prev, item.id]))
                            }
                            style={{
                              maxWidth: "100%",
                              maxHeight: 400,
                              borderRadius: 8,
                              border: "0.5px solid var(--color-border)",
                              display: "block",
                            }}
                          />
                          <button
                            onClick={() => removerImagem(item.id)}
                            disabled={removendoImagem === item.id}
                            title="Remover imagem"
                            style={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              background: "rgba(0,0,0,0.55)",
                              border: "none",
                              borderRadius: 6,
                              padding: "4px 8px",
                              cursor: "pointer",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            <ImageOff size={12} />
                            {removendoImagem === item.id ? "Removendo..." : "Remover"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo/Editar */}
      {modalAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setModalAberto(false)}
        >
          <div
            style={{
              backgroundColor: "var(--color-bg-primary)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              padding: "24px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Título modal */}
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
                {editando ? "Editar FAQ" : "Novo FAQ"}
              </h2>
              <button
                onClick={() => setModalAberto(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Sistema */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Sistema <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  list="sistemas-list"
                  value={form.nom_sistema}
                  onChange={(e) => setForm((f) => ({ ...f, nom_sistema: e.target.value }))}
                  placeholder="Ex: DTEF, Contratos, AnyDesk..."
                  style={{
                    width: "100%",
                    height: 36,
                    padding: "0 12px",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--color-text-primary)",
                    backgroundColor: "var(--color-bg-secondary)",
                    outline: "none",
                  }}
                />
                <datalist id="sistemas-list">
                  {sistemasDisponiveis.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>

              {/* Assunto */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Assunto <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  value={form.des_assunto}
                  onChange={(e) => setForm((f) => ({ ...f, des_assunto: e.target.value }))}
                  placeholder="Título / assunto do FAQ"
                  style={{
                    width: "100%",
                    height: 36,
                    padding: "0 12px",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--color-text-primary)",
                    backgroundColor: "var(--color-bg-secondary)",
                    outline: "none",
                  }}
                />
              </div>

              {/* Problema */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Problema / Erro
                </label>
                <textarea
                  value={form.des_erro}
                  onChange={(e) => setForm((f) => ({ ...f, des_erro: e.target.value }))}
                  placeholder="Descreva o problema ou erro..."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--color-text-primary)",
                    backgroundColor: "var(--color-bg-secondary)",
                    outline: "none",
                    resize: "vertical",
                    lineHeight: 1.6,
                  }}
                />
              </div>

              {/* Solução */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Solução / Resolução
                </label>
                <textarea
                  value={form.des_resolucao}
                  onChange={(e) => setForm((f) => ({ ...f, des_resolucao: e.target.value }))}
                  placeholder="Descreva a solução..."
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--color-text-primary)",
                    backgroundColor: "var(--color-bg-secondary)",
                    outline: "none",
                    resize: "vertical",
                    lineHeight: 1.6,
                  }}
                />
              </div>

              {/* Imagem */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Imagem do erro (opcional)
                </label>
                <input
                  ref={imagemInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  style={{ display: "none" }}
                  onChange={handleImagemChange}
                />
                {imagemPreview ? (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagemPreview}
                      alt="Preview"
                      style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, border: "0.5px solid var(--color-border)", display: "block" }}
                      onError={() => setImagemPreview(null)}
                    />
                    <button
                      type="button"
                      onClick={() => { setImagemFile(null); setImagemPreview(null); if (imagemInputRef.current) imagemInputRef.current.value = ""; }}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 5,
                        padding: "3px 5px", cursor: "pointer", color: "#fff",
                        display: "flex", alignItems: "center",
                      }}
                    >
                      <X size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => imagemInputRef.current?.click()}
                      style={{
                        position: "absolute", top: 4, left: 4,
                        background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 5,
                        padding: "3px 7px", cursor: "pointer", color: "#fff", fontSize: 11,
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <ImagePlus size={12} />
                      Trocar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imagemInputRef.current?.click()}
                    style={{
                      width: "100%",
                      height: 80,
                      border: "1.5px dashed var(--color-border)",
                      borderRadius: 8,
                      backgroundColor: "var(--color-bg-secondary)",
                      cursor: "pointer",
                      color: "var(--color-text-muted)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    <ImagePlus size={20} />
                    Clique para adicionar imagem
                  </button>
                )}
              </div>

              {erro && (
                <p style={{ fontSize: 12, color: "#b91c1c", backgroundColor: "#fee2e2", border: "0.5px solid #fca5a5", borderRadius: 8, padding: "8px 12px" }}>
                  {erro}
                </p>
              )}

              {/* Botões */}
              <div className="flex justify-end gap-2" style={{ marginTop: 4 }}>
                <button
                  onClick={() => setModalAberto(false)}
                  style={{
                    height: 36,
                    padding: "0 16px",
                    borderRadius: 8,
                    border: "0.5px solid var(--color-border)",
                    backgroundColor: "var(--color-bg-secondary)",
                    color: "var(--color-text-secondary)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={salvar}
                  disabled={salvando}
                  style={{
                    height: 36,
                    padding: "0 20px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "var(--color-brand)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: salvando ? "not-allowed" : "pointer",
                    opacity: salvando ? 0.7 : 1,
                  }}
                >
                  {salvando ? "Salvando..." : editando ? "Salvar" : "Criar FAQ"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
