"use client";

import { useState, useMemo } from "react";
import { Plus, X, Pencil, Trash2, Copy, ExternalLink } from "lucide-react";

interface Item {
  id: number;
  des_projeto: string;
  des_funcao: string | null;
  des_complemento: string | null;
  des_link: string | null;
  criado_em: string;
}

interface Props {
  inicial: Item[];
}

const ITEM_VAZIO = { des_projeto: "", des_funcao: "", des_complemento: "", des_link: "" };

type ModalTipo =
  | { tipo: "novo_projeto" }
  | { tipo: "novo_item"; projeto: string }
  | { tipo: "editar_item"; item: Item }
  | { tipo: "editar_projeto"; nome: string }
  | null;

export default function DadosRestritosClient({ inicial }: Props) {
  const [itens, setItens] = useState<Item[]>(inicial);
  const [modal, setModal] = useState<ModalTipo>(null);
  const [form, setForm] = useState(ITEM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);

  // Agrupa por des_projeto
  const grupos = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of itens) {
      const proj = it.des_projeto || "(sem projeto)";
      if (!map.has(proj)) map.set(proj, []);
      map.get(proj)!.push(it);
    }
    return Array.from(map.entries())
      .map(([projeto, items]) => ({ projeto, items }))
      .sort((a, b) => a.projeto.localeCompare(b.projeto));
  }, [itens]);

  function abrirModalNovoProjeto() {
    setForm(ITEM_VAZIO);
    setModal({ tipo: "novo_projeto" });
  }

  function abrirModalNovoItem(projeto: string) {
    setForm({ ...ITEM_VAZIO, des_projeto: projeto });
    setModal({ tipo: "novo_item", projeto });
  }

  function abrirModalEditarItem(item: Item) {
    setForm({
      des_projeto: item.des_projeto ?? "",
      des_funcao: item.des_funcao ?? "",
      des_complemento: item.des_complemento ?? "",
      des_link: item.des_link ?? "",
    });
    setModal({ tipo: "editar_item", item });
  }

  function abrirModalEditarProjeto(nome: string) {
    setForm({ ...ITEM_VAZIO, des_projeto: nome });
    setModal({ tipo: "editar_projeto", nome });
  }

  function fechar() {
    setModal(null);
    setForm(ITEM_VAZIO);
  }

  async function salvar() {
    if (!form.des_projeto || !form.des_funcao) return;
    setSalvando(true);
    try {
      if (modal?.tipo === "editar_item") {
        const res = await fetch(`/api/intranet/dados-restritos/${modal.item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const salvo: Item = await res.json();
        setItens(prev => prev.map(i => i.id === salvo.id ? salvo : i));
      } else {
        // novo_projeto ou novo_item
        const res = await fetch("/api/intranet/dados-restritos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const salvo: Item = await res.json();
        setItens(prev => [...prev, salvo]);
      }
      fechar();
    } finally {
      setSalvando(false);
    }
  }

  async function renomearProjeto() {
    if (modal?.tipo !== "editar_projeto") return;
    if (!form.des_projeto) return;
    setSalvando(true);
    try {
      await fetch("/api/intranet/dados-restritos/projeto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_nome: modal.nome, new_nome: form.des_projeto }),
      });
      setItens(prev =>
        prev.map(i => i.des_projeto === modal.nome ? { ...i, des_projeto: form.des_projeto } : i)
      );
      fechar();
    } finally {
      setSalvando(false);
    }
  }

  async function excluirItem(id: number) {
    if (!confirm("Excluir este item?")) return;
    await fetch(`/api/intranet/dados-restritos/${id}`, { method: "DELETE" });
    setItens(prev => prev.filter(i => i.id !== id));
  }

  async function excluirProjeto(nome: string) {
    if (!confirm(`Excluir o projeto "${nome}" e todos os seus itens?`)) return;
    await fetch(`/api/intranet/dados-restritos/projeto?nome=${encodeURIComponent(nome)}`, { method: "DELETE" });
    setItens(prev => prev.filter(i => i.des_projeto !== nome));
  }

  function copiar(texto: string, id: number) {
    navigator.clipboard.writeText(texto).catch(() => {});
    setCopiado(id);
    setTimeout(() => setCopiado(null), 1500);
  }

  const modalAberto = modal !== null;
  const isEditarProjeto = modal?.tipo === "editar_projeto";

  // ─── Estilos ─────────────────────────────────────────────────────────────────
  const s = {
    page: { padding: "28px 32px", fontFamily: "inherit" } as React.CSSProperties,
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 } as React.CSSProperties,
    titulo: { fontSize: 22, fontWeight: 700, color: "#1e1b4b", display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
    headerBtns: { display: "flex", gap: 10 } as React.CSSProperties,
    btnNovoProjeto: { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#4c1d95,#2d0072)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
    grupo: { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 20 } as React.CSSProperties,
    grupoHeader: { background: "#3b0764", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" } as React.CSSProperties,
    grupoNome: { fontWeight: 700, fontSize: 16, color: "#fff", display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
    grupoAcoes: { display: "flex", gap: 6 } as React.CSSProperties,
    btnIconGrupo: { background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center" } as React.CSSProperties,
    btnAdicionarItem: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, margin: "14px 16px", padding: "10px", border: "2px dashed #c4b5fd", borderRadius: 10, background: "transparent", color: "#6d28d9", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "calc(100% - 32px)" } as React.CSSProperties,
    item: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid #f3f4f6" } as React.CSSProperties,
    itemInfo: { flex: 1 } as React.CSSProperties,
    itemFuncao: { fontWeight: 700, fontSize: 14, color: "#111827" } as React.CSSProperties,
    itemComplemento: { fontSize: 12, color: "#6b7280", fontFamily: "monospace", marginTop: 2 } as React.CSSProperties,
    itemAcoes: { display: "flex", gap: 6, alignItems: "center" } as React.CSSProperties,
    btnCopiar: { display: "flex", alignItems: "center", gap: 5, background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#374151" } as React.CSSProperties,
    btnAbrir: { display: "flex", alignItems: "center", gap: 5, background: "#3b0764", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff" } as React.CSSProperties,
    btnEditar: { background: "#6d28d9", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center" } as React.CSSProperties,
    btnExcluir: { background: "#ef4444", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center" } as React.CSSProperties,
    // Modal
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" } as React.CSSProperties,
    modalBox: { background: "#fff", borderRadius: 16, padding: "32px 28px", width: "min(96vw,480px)", maxHeight: "90vh", overflowY: "auto" } as React.CSSProperties,
    modalTopo: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 } as React.CSSProperties,
    modalTitulo: { fontSize: 20, fontWeight: 700, color: "#1e1b4b" } as React.CSSProperties,
    btnFechar: { background: "none", border: "none", cursor: "pointer", color: "#6b7280" } as React.CSSProperties,
    hr: { border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" } as React.CSSProperties,
    label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 } as React.CSSProperties,
    input: { width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" as const, marginBottom: 14 } as React.CSSProperties,
    modalBtns: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 } as React.CSSProperties,
    btnCancelar: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 14 } as React.CSSProperties,
    btnSalvar: { background: "#4c1d95", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontSize: 14, fontWeight: 700 } as React.CSSProperties,
  };

  return (
    <div style={s.page}>
      {/* Cabeçalho */}
      <div style={s.header}>
        <div style={s.titulo}>🔒 Dados Restritos</div>
        <div style={s.headerBtns}>
          <button style={s.btnNovoProjeto} onClick={abrirModalNovoProjeto}>
            <Plus size={14} /> Novo Projeto
          </button>
        </div>
      </div>

      {/* Grupos */}
      {grupos.length === 0 && (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: 60 }}>
          Nenhum dado restrito cadastrado.
        </div>
      )}

      {grupos.map(({ projeto, items }) => (
        <div key={projeto} style={s.grupo}>
          {/* Header do grupo */}
          <div style={s.grupoHeader}>
            <div style={s.grupoNome}>
              📁 {projeto}
            </div>
            <div style={s.grupoAcoes}>
              <button style={s.btnIconGrupo} title="Renomear projeto" onClick={() => abrirModalEditarProjeto(projeto)}>
                <Pencil size={13} />
              </button>
              <button style={s.btnIconGrupo} title="Excluir projeto" onClick={() => excluirProjeto(projeto)}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Botão adicionar item */}
          <button style={s.btnAdicionarItem} onClick={() => abrirModalNovoItem(projeto)}>
            <Plus size={14} /> Adicionar Item
          </button>

          {/* Itens */}
          {items.map(item => (
            <div key={item.id} style={s.item}>
              <div style={s.itemInfo}>
                <div style={s.itemFuncao}>{item.des_funcao}</div>
                {item.des_complemento && (
                  <div style={s.itemComplemento}>{item.des_complemento}</div>
                )}
              </div>
              <div style={s.itemAcoes}>
                {item.des_link ? (
                  <a href={item.des_link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <button style={s.btnAbrir}>
                      <ExternalLink size={12} /> Abrir
                    </button>
                  </a>
                ) : item.des_complemento ? (
                  <button
                    style={s.btnCopiar}
                    onClick={() => copiar(item.des_complemento!, item.id)}
                  >
                    <Copy size={12} /> {copiado === item.id ? "Copiado!" : "Copiar"}
                  </button>
                ) : null}
                <button style={s.btnEditar} onClick={() => abrirModalEditarItem(item)}>
                  <Pencil size={13} />
                </button>
                <button style={s.btnExcluir} onClick={() => excluirItem(item.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Modal */}
      {modalAberto && (
        <div style={s.overlay} onClick={fechar}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={s.modalTopo}>
              <div style={s.modalTitulo}>
                {isEditarProjeto
                  ? "Renomear Projeto"
                  : modal?.tipo === "editar_item"
                  ? "Editar Item"
                  : modal?.tipo === "novo_projeto"
                  ? "Novo Projeto"
                  : "Adicionar Item"}
              </div>
              <button style={s.btnFechar} onClick={fechar}><X size={18} /></button>
            </div>
            <hr style={s.hr} />

            {isEditarProjeto ? (
              <>
                <label style={s.label}>Nome do Projeto *</label>
                <input
                  style={s.input}
                  value={form.des_projeto}
                  onChange={e => setForm(f => ({ ...f, des_projeto: e.target.value }))}
                  placeholder="Nome do projeto"
                  autoFocus
                />
                <div style={s.modalBtns}>
                  <button style={s.btnCancelar} onClick={fechar}>Cancelar</button>
                  <button style={s.btnSalvar} onClick={renomearProjeto} disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label style={s.label}>Projeto *</label>
                <input
                  style={{
                    ...s.input,
                    background: modal?.tipo === "novo_item" ? "#f9fafb" : undefined,
                    color: modal?.tipo === "novo_item" ? "#6b7280" : undefined,
                  }}
                  value={form.des_projeto}
                  onChange={e => setForm(f => ({ ...f, des_projeto: e.target.value }))}
                  readOnly={modal?.tipo === "novo_item"}
                  placeholder="Ex: Linx"
                />

                <label style={s.label}>Função *</label>
                <input
                  style={s.input}
                  value={form.des_funcao}
                  onChange={e => setForm(f => ({ ...f, des_funcao: e.target.value }))}
                  placeholder="Ex: Senha Mestra"
                  autoFocus={modal?.tipo !== "novo_item"}
                />

                <label style={s.label}>Complemento</label>
                <input
                  style={s.input}
                  value={form.des_complemento}
                  onChange={e => setForm(f => ({ ...f, des_complemento: e.target.value }))}
                  placeholder="Ex: obiwankenobi"
                />

                <label style={s.label}>Link (opcional)</label>
                <input
                  style={s.input}
                  value={form.des_link}
                  onChange={e => setForm(f => ({ ...f, des_link: e.target.value }))}
                  placeholder="Ex: https://..."
                  type="url"
                />

                <div style={s.modalBtns}>
                  <button style={s.btnCancelar} onClick={fechar}>Cancelar</button>
                  <button style={s.btnSalvar} onClick={salvar} disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
