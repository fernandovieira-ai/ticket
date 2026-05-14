"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, Plus, Trash2, Send, X, ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { RichTextEditor, type RichTextEditorRef } from "@/components/ui/rich-text-editor";

interface Anexo {
  nome: string;
  url: string;
  tamanho: number;
  mime_type: string;
}

interface Mensagem {
  id: number;
  username: string;
  mensagem: string;
  created_at: string;
  tem_imagem: boolean;
  avatar_url: string | null;
  anexos: Anexo[];
}

interface Props {
  usuarioNome: string;
  usuarioPerfil: string;
}

const CARD_POR_PAG = 8;

// Detecta URLs no texto e transforma em links clicáveis
function linkificar(texto: string): string {
  return texto.replace(
    /(?<!href=["'])(https?:\/\/[^\s<>"')\]]+)/gi,
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}
const MODAL_POR_PAG = 5;

function Paginacao({
  pagina, total, onChange, tamanho = "sm",
}: {
  pagina: number; total: number; onChange: (p: number) => void; tamanho?: "sm" | "md";
}) {
  if (total <= 1) return null;
  const fs = tamanho === "sm" ? 11 : 13;
  const pad = tamanho === "sm" ? "3px 7px" : "5px 12px";
  const base: React.CSSProperties = { border: "0.5px solid var(--color-border)", background: "var(--color-bg-secondary)", borderRadius: 6, cursor: "pointer", fontSize: fs, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", padding: pad };
  const ativo: React.CSSProperties = { ...base, background: "#0E1326", color: "white", border: "0.5px solid #0E1326", fontWeight: 700 };
  const dis: React.CSSProperties = { ...base, opacity: 0.35, cursor: "not-allowed" };
  const paginas: (number | "...")[] = [];
  if (total <= 7) { for (let i = 1; i <= total; i++) paginas.push(i); }
  else {
    paginas.push(1);
    if (pagina > 3) paginas.push("...");
    for (let i = Math.max(2, pagina - 1); i <= Math.min(total - 1, pagina + 1); i++) paginas.push(i);
    if (pagina < total - 2) paginas.push("...");
    paginas.push(total);
  }
  const ico = tamanho === "sm" ? 12 : 14;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center", padding: "8px 0" }}>
      <button style={pagina === 1 ? dis : base} disabled={pagina === 1} onClick={() => onChange(pagina - 1)}>
        <ChevronLeft style={{ width: ico, height: ico }} />
      </button>
      {paginas.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} style={{ fontSize: fs, color: "var(--color-text-muted)", padding: "0 2px" }}>…</span>
        ) : (
          <button key={p} style={p === pagina ? ativo : base} onClick={() => onChange(p as number)}>{p}</button>
        )
      )}
      <button style={pagina === total ? dis : base} disabled={pagina === total} onClick={() => onChange(pagina + 1)}>
        <ChevronRight style={{ width: ico, height: ico }} />
      </button>
      <span style={{ fontSize: fs - 1, color: "var(--color-text-muted)", marginLeft: 4 }}>{pagina}/{total}</span>
    </div>
  );
}

export function MuralRecados({ usuarioNome, usuarioPerfil }: Props) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMsg, setNovaMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [paginaCard, setPaginaCard] = useState(1);
  const [paginaModal, setPaginaModal] = useState(1);
  const [attachments, setAttachments] = useState<File[]>([]);
  const editorRef = useRef<RichTextEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarMensagens();
  }, []);

  async function carregarMensagens() {
    try {
      const res = await fetch("/api/intranet/mensagens");
      if (res.ok) {
        setMensagens(await res.json());
        setPaginaCard(1);
        setPaginaModal(1);
      }
    } catch {}
  }

  async function handleEnviar() {
    const textoLimpo = novaMsg.replace(/<[^>]*>/g, "").trim();
    if (!textoLimpo) return;
    setEnviando(true);
    try {
      let res: Response;
      if (attachments.length > 0) {
        const fd = new FormData();
        fd.append("mensagem", novaMsg);
        for (const f of attachments) fd.append("arquivos", f);
        res = await fetch("/api/intranet/mensagens", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/intranet/mensagens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensagem: novaMsg }),
        });
      }
      if (res.ok) {
        setNovaMsg("");
        setAttachments([]);
        editorRef.current?.clear();
        await carregarMensagens();
      }
    } finally {
      setEnviando(false);
    }
  }

  async function handleExcluir(id: number) {
    setExcluindo(id);
    try {
      const res = await fetch(`/api/intranet/mensagens/${id}`, { method: "DELETE" });
      if (res.ok) setMensagens((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setExcluindo(null);
    }
  }

  function formatarData(dt: string) {
    const d = new Date(dt);
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);

    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === hoje.toDateString()) return `Hoje ${hora}`;
    if (d.toDateString() === ontem.toDateString()) return `Ontem ${hora}`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + hora;
  }

  function iniciais(nome: string) {
    return nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  }

  const cores = ["#6d28d9", "#0E1326", "#16a34a", "#dc2626", "#d97706", "#0891b2"];
  function corAvatar(nome: string) {
    let hash = 0;
    for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
    return cores[Math.abs(hash) % cores.length];
  }

  function AvatarUser({ msg, size }: { msg: Mensagem; size: number }) {
    if (msg.avatar_url) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={msg.avatar_url}
          alt={msg.username}
          style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        />
      );
    }
    return (
      <div
        style={{
          width: size, height: size, borderRadius: "50%", backgroundColor: corAvatar(msg.username),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.35, fontWeight: 700, color: "white", flexShrink: 0,
        }}
      >
        {iniciais(msg.username)}
      </div>
    );
  }

  // Paginação card (mais recente primeiro)
  const totalPaginasCard = Math.max(1, Math.ceil(mensagens.length / CARD_POR_PAG));
  const msgCard = mensagens.slice((paginaCard - 1) * CARD_POR_PAG, paginaCard * CARD_POR_PAG);

  // Paginação modal (mais antiga primeiro)
  const ordenadas = [...mensagens].reverse();
  const totalPaginasModal = Math.max(1, Math.ceil(ordenadas.length / MODAL_POR_PAG));
  const msgModal = ordenadas.slice((paginaModal - 1) * MODAL_POR_PAG, paginaModal * MODAL_POR_PAG);

  return (
    <>
      {/* Card do mural */}
      <div
        style={{
          backgroundColor: "var(--color-bg-primary)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--color-border)" }}
        >
          <p
            className="flex items-center gap-2"
            style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
          >
            <MessageSquare className="w-4 h-4 text-purple-500" />
            Mural de Recados
          </p>
          <button
            onClick={() => setModalAberto(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              color: "#6d28d9",
              background: "rgba(109,40,217,0.08)",
              border: "1px solid rgba(109,40,217,0.2)",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            <Plus className="w-3 h-3" />
            Nova Mensagem
          </button>
        </div>

        {/* Lista paginada */}
        <div style={{ padding: "10px 12px" }} className="space-y-2">
          {mensagens.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "8px 0" }}>
              Nenhuma mensagem ainda. Seja o primeiro!
            </p>
          ) : (
            msgCard.map((msg) => {
              const isOwn = msg.username === usuarioNome;
              const podeExcluir = isOwn || usuarioPerfil === "admin";
              return (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 10,
                    backgroundColor: isOwn ? "rgba(109,40,217,0.05)" : "var(--color-bg-secondary)",
                    border: isOwn ? "0.5px solid rgba(109,40,217,0.15)" : "0.5px solid var(--color-border)",
                  }}
                >
                  {/* Avatar */}
                  <AvatarUser msg={msg} size={30} />

                  {/* Conteúdo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontSize: 11, fontWeight: 700, color: corAvatar(msg.username) }}>
                        {msg.username}
                      </span>
                      <div className="flex items-center gap-1">
                        <span style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                          {formatarData(msg.created_at)}
                        </span>
                        {podeExcluir && (
                          <button
                            onClick={() => handleExcluir(msg.id)}
                            disabled={excluindo === msg.id}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#dc2626",
                              padding: 2,
                              display: "flex",
                              opacity: excluindo === msg.id ? 0.5 : 0.6,
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, marginTop: 2 }}
                      className="mural-msg-body"
                      dangerouslySetInnerHTML={{ __html: linkificar(msg.mensagem) }}
                    />
                    {(msg.anexos?.length > 0) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {msg.anexos.map((a, i) => (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              fontSize: 11, borderRadius: 5, padding: "3px 8px",
                              background: "var(--color-bg-secondary)",
                              border: "0.5px solid var(--color-border)",
                              color: "#2563eb", textDecoration: "none",
                            }}
                          >
                            <Paperclip style={{ width: 10, height: 10, flexShrink: 0 }} />
                            <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.nome}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                    {msg.tem_imagem && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/intranet/mensagens/${msg.id}/imagem`}
                        alt="anexo"
                        style={{ marginTop: 6, maxWidth: "100%", maxHeight: 120, borderRadius: 6, objectFit: "contain", cursor: "pointer" }}
                        onClick={() => window.open(`/api/intranet/mensagens/${msg.id}/imagem`, "_blank")}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Paginação card */}
        {mensagens.length > CARD_POR_PAG && (
          <div style={{ borderTop: "0.5px solid var(--color-border)", padding: "0 12px" }}>
            <Paginacao pagina={paginaCard} total={totalPaginasCard} onChange={setPaginaCard} tamanho="sm" />
          </div>
        )}

        {/* Input rápido */}
        <div
          style={{
            padding: "10px 12px",
            borderTop: "0.5px solid var(--color-border)",
            display: "flex",
            gap: 8,
          }}
        >
          <input
            value={novaMsg}
            onChange={(e) => setNovaMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEnviar(); } }}
            placeholder="Escreva um recado..."
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: 8,
              border: "0.5px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-primary)",
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            onClick={handleEnviar}
            disabled={enviando || !novaMsg.trim()}
            style={{
              background: "#0E1326",
              border: "none",
              borderRadius: 8,
              padding: "7px 12px",
              cursor: enviando || !novaMsg.trim() ? "not-allowed" : "pointer",
              color: "white",
              display: "flex",
              alignItems: "center",
              opacity: !novaMsg.trim() ? 0.4 : 1,
            }}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modal Mural completo */}
      {modalAberto && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setModalAberto(false); }}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div
            style={{
              background: "var(--color-bg-primary)",
              borderRadius: 16,
              width: "90vw",
              maxWidth: 1100,
              height: "85vh",
              boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "0.5px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
                💬 Mural de Recados
              </p>
              <button
                onClick={() => setModalAberto(false)}
                style={{
                  background: "var(--color-bg-secondary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: 6, padding: 6, cursor: "pointer",
                  color: "var(--color-text-muted)", display: "flex",
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Paginação topo modal */}
            {totalPaginasModal > 1 && (
              <div style={{ borderBottom: "0.5px solid var(--color-border)", padding: "4px 24px" }}>
                <Paginacao pagina={paginaModal} total={totalPaginasModal} onChange={setPaginaModal} tamanho="md" />
              </div>
            )}

            {/* Lista de mensagens */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {mensagens.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Nenhuma mensagem ainda.</p>
              ) : (
                msgModal.map((msg) => {
                  const isOwn = msg.username === usuarioNome;
                  const podeExcluir = isOwn || usuarioPerfil === "admin";
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "12px 16px",
                        borderRadius: 12,
                        backgroundColor: isOwn ? "rgba(109,40,217,0.06)" : "var(--color-bg-secondary)",
                        border: isOwn ? "0.5px solid rgba(109,40,217,0.2)" : "0.5px solid var(--color-border)",
                      }}
                    >
                      {/* Avatar */}
                      <AvatarUser msg={msg} size={38} />

                      {/* Conteúdo */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center justify-between gap-2" style={{ marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: corAvatar(msg.username) }}>
                            {msg.username}
                          </span>
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                              {formatarData(msg.created_at)}
                            </span>
                            {podeExcluir && (
                              <button
                                onClick={() => handleExcluir(msg.id)}
                                disabled={excluindo === msg.id}
                                style={{
                                  background: "none", border: "none", cursor: "pointer",
                                  color: "#dc2626", padding: 2, display: "flex",
                                  opacity: excluindo === msg.id ? 0.5 : 0.7,
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div
                          style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}
                          className="mural-msg-body"
                          dangerouslySetInnerHTML={{ __html: linkificar(msg.mensagem) }}
                        />
                        {(msg.anexos?.length > 0) && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {msg.anexos.map((a, i) => (
                              <a
                                key={i}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 5,
                                  fontSize: 12, borderRadius: 6, padding: "4px 10px",
                                  background: "var(--color-bg-secondary)",
                                  border: "0.5px solid var(--color-border)",
                                  color: "#2563eb", textDecoration: "none",
                                }}
                              >
                                <Paperclip style={{ width: 11, height: 11, flexShrink: 0 }} />
                                <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {a.nome}
                                </span>
                              </a>
                            ))}
                          </div>
                        )}
                        {msg.tem_imagem && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/intranet/mensagens/${msg.id}/imagem`}
                            alt="anexo"
                            style={{ marginTop: 10, maxWidth: "100%", maxHeight: 400, borderRadius: 8, objectFit: "contain", cursor: "pointer" }}
                            onClick={() => window.open(`/api/intranet/mensagens/${msg.id}/imagem`, "_blank")}
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Paginação rodapé modal */}
            {totalPaginasModal > 1 && (
              <div style={{ borderTop: "0.5px solid var(--color-border)", padding: "4px 24px" }}>
                <Paginacao pagina={paginaModal} total={totalPaginasModal} onChange={setPaginaModal} tamanho="md" />
              </div>
            )}

            {/* Área de composição */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "0.5px solid var(--color-border)",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <RichTextEditor
                ref={editorRef}
                value={novaMsg}
                onChange={setNovaMsg}
                placeholder="Escreva sua mensagem para o mural..."
                onAttach={(files) => setAttachments((prev) => [...prev, ...files])}
                disabled={enviando}
              />

              {/* Arquivos anexados pendentes */}
              {attachments.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {attachments.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: "var(--color-bg-secondary)",
                        border: "0.5px solid var(--color-border)",
                        borderRadius: 6, padding: "4px 10px", fontSize: 12,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <Paperclip style={{ width: 11, height: 11 }} />
                      <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                      <button
                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#dc2626" }}
                      >
                        <X style={{ width: 11, height: 11 }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  onClick={() => setModalAberto(false)}
                  style={{
                    padding: "8px 18px", borderRadius: 8,
                    border: "0.5px solid var(--color-border)",
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text-secondary)",
                    fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Fechar
                </button>
                <button
                  onClick={async () => { await handleEnviar(); }}
                  disabled={enviando || !novaMsg.replace(/<[^>]*>/g, "").trim()}
                  style={{
                    padding: "8px 24px", borderRadius: 8, border: "none",
                    background: "#0E1326", color: "white",
                    fontSize: 13, fontWeight: 600,
                    cursor: enviando || !novaMsg.replace(/<[^>]*>/g, "").trim() ? "not-allowed" : "pointer",
                    opacity: !novaMsg.replace(/<[^>]*>/g, "").trim() ? 0.5 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                  {enviando ? "Enviando..." : "Publicar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
