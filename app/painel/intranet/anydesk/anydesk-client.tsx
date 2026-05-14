"use client";

import { useState, useMemo } from "react";
import { Monitor, Plus, X, Eye, EyeOff, Copy, Pencil, Trash2 } from "lucide-react";

interface Acesso {
  id: number;
  rede: string;
  unidade: string | null;
  host: string | null;
  end_anydesk: string | null;
  senha_anydesk: string | null;
  criado_em: string;
}

interface Props {
  inicial: Acesso[];
}

const FORM_VAZIO = { rede: "", unidade: "", host: "", end_anydesk: "", senha_anydesk: "" };

export default function AnydeskClient({ inicial }: Props) {
  const [acessos, setAcessos] = useState<Acesso[]>(inicial);
  const [busca, setBusca] = useState("");
  const [redeSelecionada, setRedeSelecionada] = useState<string | null>(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [editando, setEditando] = useState<Acesso | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [senhasVisiveis, setSenhasVisiveis] = useState<Set<number>>(new Set());

  // Agrupa por rede
  const grupos = useMemo(() => {
    const map = new Map<string, Acesso[]>();
    for (const a of acessos) {
      const rede = a.rede || "(sem rede)";
      if (!map.has(rede)) map.set(rede, []);
      map.get(rede)!.push(a);
    }
    return Array.from(map.entries())
      .map(([rede, items]) => ({ rede, items }))
      .sort((a, b) => a.rede.localeCompare(b.rede));
  }, [acessos]);

  // Filtra grupos pela busca
  const gruposFiltrados = useMemo(() => {
    if (!busca.trim()) return grupos;
    const q = busca.toLowerCase();
    return grupos
      .map(g => ({
        ...g,
        items: g.items.filter(a =>
          (a.rede ?? "").toLowerCase().includes(q) ||
          (a.unidade ?? "").toLowerCase().includes(q) ||
          (a.host ?? "").toLowerCase().includes(q) ||
          (a.end_anydesk ?? "").toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.items.length > 0);
  }, [grupos, busca]);

  // Acessos da rede selecionada (com busca aplicada)
  const acessosRede = useMemo(() => {
    if (!redeSelecionada) return [];
    const grp = gruposFiltrados.find(g => g.rede === redeSelecionada);
    return grp?.items ?? [];
  }, [redeSelecionada, gruposFiltrados]);

  function toggleSenha(id: number) {
    setSenhasVisiveis(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function copiar(texto: string) {
    navigator.clipboard.writeText(texto).catch(() => {});
  }

  function abrirNovo() {
    setForm(redeSelecionada ? { ...FORM_VAZIO, rede: redeSelecionada } : FORM_VAZIO);
    setEditando(null);
    setModalNovo(true);
  }

  function abrirEditar(a: Acesso) {
    setForm({
      rede: a.rede ?? "",
      unidade: a.unidade ?? "",
      host: a.host ?? "",
      end_anydesk: a.end_anydesk ?? "",
      senha_anydesk: a.senha_anydesk ?? "",
    });
    setEditando(a);
    setModalNovo(true);
  }

  function fecharModal() {
    setModalNovo(false);
    setEditando(null);
    setForm(FORM_VAZIO);
  }

  async function salvar() {
    if (!form.rede || !form.host || !form.end_anydesk) return;
    setSalvando(true);
    try {
      const url = editando ? `/api/intranet/anydesk/${editando.id}` : "/api/intranet/anydesk";
      const method = editando ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      const salvo: Acesso = await res.json();
      if (editando) {
        setAcessos(prev => prev.map(a => a.id === salvo.id ? salvo : a));
      } else {
        setAcessos(prev => [...prev, salvo]);
        if (redeSelecionada && salvo.rede !== redeSelecionada) {
          setRedeSelecionada(salvo.rede);
        }
      }
      fecharModal();
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number) {
    if (!confirm("Excluir este acesso?")) return;
    await fetch(`/api/intranet/anydesk/${id}`, { method: "DELETE" });
    setAcessos(prev => prev.filter(a => a.id !== id));
  }

  // ─── Estilos ─────────────────────────────────────────────
  const s = {
    page: { padding: "28px 32px", fontFamily: "inherit" } as React.CSSProperties,
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 } as React.CSSProperties,
    titulo: { fontSize: 22, fontWeight: 700, color: "#1e1b4b", display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
    btnNovo: { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#4c1d95,#2d0072)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
    buscaWrap: { background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
    buscaInput: { flex: 1, border: "none", outline: "none", fontSize: 14, color: "#374151", background: "transparent" } as React.CSSProperties,
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 } as React.CSSProperties,
    cardRede: { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: "20px 22px", cursor: "pointer", transition: "box-shadow .15s" } as React.CSSProperties,
    cardRedeNome: { fontWeight: 700, fontSize: 17, color: "#1e1b4b", display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
    badge: { background: "#4c1d95", color: "#fff", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 } as React.CSSProperties,
    cardRedeSub: { fontSize: 13, color: "#6b7280", marginTop: 8 } as React.CSSProperties,
    // Modal rede
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" } as React.CSSProperties,
    modalRede: { background: "#f9f9fc", width: "min(96vw, 860px)", height: "100vh", overflowY: "auto", padding: "28px 28px" } as React.CSSProperties,
    modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 } as React.CSSProperties,
    modalTitulo: { fontSize: 20, fontWeight: 700, color: "#1e1b4b" } as React.CSSProperties,
    btnFechar: { background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 22 } as React.CSSProperties,
    cardAcesso: { background: "#fff5f5", border: "1.5px solid #fca5a5", borderRadius: 14, padding: "18px 18px 14px" } as React.CSSProperties,
    acessoHost: { fontWeight: 700, fontSize: 15, color: "#991b1b", display: "flex", alignItems: "center", gap: 7, marginBottom: 10 } as React.CSSProperties,
    acessoLabel: { fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, marginBottom: 3 } as React.CSSProperties,
    acessoVal: { background: "#fff", border: "1px solid #fca5a5", borderRadius: 6, padding: "6px 10px", fontSize: 14, color: "#1f2937", width: "100%", boxSizing: "border-box" as const, marginBottom: 8 } as React.CSSProperties,
    acessoBtns: { display: "flex", gap: 8, marginTop: 6 } as React.CSSProperties,
    btnEditar: { flex: 1, background: "#fef9c3", border: "1px solid #fde68a", color: "#92400e", borderRadius: 6, padding: "6px 0", cursor: "pointer", fontSize: 13, fontWeight: 600 } as React.CSSProperties,
    btnExcluir: { flex: 1, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: 6, padding: "6px 0", cursor: "pointer", fontSize: 13, fontWeight: 600 } as React.CSSProperties,
    senhaRow: { display: "flex", alignItems: "center", gap: 4, marginBottom: 8 } as React.CSSProperties,
    senhaValor: { flex: 1, background: "#fff", border: "1px solid #fca5a5", borderRadius: 6, padding: "6px 10px", fontSize: 14, color: "#1f2937", fontFamily: "monospace" } as React.CSSProperties,
    iconBtn: { background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 4 } as React.CSSProperties,
    // Modal form
    modalForm: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" } as React.CSSProperties,
    formBox: { background: "#fff", borderRadius: 16, padding: "32px 28px", width: "min(96vw,520px)", maxHeight: "90vh", overflowY: "auto" } as React.CSSProperties,
    formTitulo: { fontSize: 20, fontWeight: 700, color: "#1e1b4b", marginBottom: 4 } as React.CSSProperties,
    hr: { border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" } as React.CSSProperties,
    label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 } as React.CSSProperties,
    input: { width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" as const, marginBottom: 14 } as React.CSSProperties,
    formBtns: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 } as React.CSSProperties,
    btnCancelar: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 14 } as React.CSSProperties,
    btnSalvar: { background: "#4c1d95", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontSize: 14, fontWeight: 700 } as React.CSSProperties,
  };

  return (
    <div style={s.page}>
      {/* Cabeçalho */}
      <div style={s.header}>
        <div style={s.titulo}>
          <Monitor size={22} color="#4c1d95" /> Redes e Acessos AnyDesk
        </div>
        <button style={s.btnNovo} onClick={abrirNovo}>
          <Plus size={14} /> Novo Acesso
        </button>
      </div>

      {/* Busca */}
      <div style={s.buscaWrap}>
        <span style={{ color: "#6b7280", fontSize: 16 }}>🔍</span>
        <input
          style={s.buscaInput}
          placeholder="Buscar rede, unidade ou host..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {/* Cards de redes */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 }}>
        {gruposFiltrados.length === 0 ? (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>Nenhuma rede encontrada.</div>
        ) : (
          <div style={s.grid}>
            {gruposFiltrados.map(g => (
              <div
                key={g.rede}
                style={s.cardRede}
                onClick={() => setRedeSelecionada(g.rede)}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(76,29,149,.15)")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
              >
                <div style={s.cardRedeNome}>
                  <span>🌐</span> {g.rede}
                  <span style={{ ...s.badge, marginLeft: "auto" }}>{g.items.length} acessos</span>
                </div>
                <div style={s.cardRedeSub}>Clique para ver todos os acessos desta rede</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal lateral: acessos da rede */}
      {redeSelecionada && (
        <div style={s.overlay} onClick={() => setRedeSelecionada(null)}>
          <div style={s.modalRede} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={s.modalTitulo}>Acessos — {redeSelecionada}</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button style={s.btnNovo} onClick={abrirNovo}>
                  <Plus size={13} /> Novo
                </button>
                <button style={s.btnFechar} onClick={() => setRedeSelecionada(null)}>×</button>
              </div>
            </div>

            {acessosRede.length === 0 ? (
              <div style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>Nenhum acesso nesta rede.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
                {acessosRede.map(a => (
                  <div key={a.id} style={s.cardAcesso}>
                    <div style={s.acessoHost}>
                      <Monitor size={16} color="#991b1b" /> {a.host || "—"}
                    </div>
                    <div style={s.acessoLabel}>UNIDADE</div>
                    <div style={s.acessoVal}>{a.unidade || "—"}</div>
                    <div style={s.acessoLabel}>ANYDESK</div>
                    <div style={{ ...s.senhaRow }}>
                      <div style={{ ...s.senhaValor, fontFamily: "inherit" }}>{a.end_anydesk || "—"}</div>
                      <button style={s.iconBtn} title="Copiar" onClick={() => copiar(a.end_anydesk ?? "")}>
                        <Copy size={14} />
                      </button>
                    </div>
                    <div style={s.acessoLabel}>SENHA</div>
                    <div style={s.senhaRow}>
                      <div style={s.senhaValor}>
                        {senhasVisiveis.has(a.id) ? (a.senha_anydesk || "—") : "••••••••"}
                      </div>
                      <button style={s.iconBtn} onClick={() => toggleSenha(a.id)}>
                        {senhasVisiveis.has(a.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button style={s.iconBtn} title="Copiar" onClick={() => copiar(a.senha_anydesk ?? "")}>
                        <Copy size={14} />
                      </button>
                    </div>
                    <div style={s.acessoBtns}>
                      <button style={s.btnEditar} onClick={() => abrirEditar(a)}>✏️ Editar</button>
                      <button style={s.btnExcluir} onClick={() => excluir(a.id)}>🗑 Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal form: novo / editar */}
      {modalNovo && (
        <div style={s.modalForm} onClick={fecharModal}>
          <div style={s.formBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={s.formTitulo}>{editando ? "Editar Acesso" : "Novo Acesso"}</div>
              <button style={s.btnFechar} onClick={fecharModal}><X size={18} /></button>
            </div>
            <hr style={s.hr} />

            <label style={s.label}>Rede (Empresa) *</label>
            <input style={s.input} placeholder="Ex: Empresa XPTO" value={form.rede} onChange={e => setForm(f => ({ ...f, rede: e.target.value }))} />

            <label style={s.label}>Unidade</label>
            <input style={s.input} placeholder="Ex: Filial Centro" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} />

            <label style={s.label}>Host (Nome do Computador) *</label>
            <input style={s.input} placeholder="Ex: PC-GERENCIA" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />

            <label style={s.label}>Endereço AnyDesk *</label>
            <input style={s.input} placeholder="Ex: 123456789" value={form.end_anydesk} onChange={e => setForm(f => ({ ...f, end_anydesk: e.target.value }))} />

            <label style={s.label}>Senha AnyDesk</label>
            <input style={s.input} placeholder="Senha de acesso" type="text" value={form.senha_anydesk} onChange={e => setForm(f => ({ ...f, senha_anydesk: e.target.value }))} />

            <div style={s.formBtns}>
              <button style={s.btnCancelar} onClick={fecharModal}>Cancelar</button>
              <button style={s.btnSalvar} onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
