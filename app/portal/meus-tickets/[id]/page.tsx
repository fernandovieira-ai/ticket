"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2,
  Send,
  Paperclip,
  ChevronDown,
  ChevronUp,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import {
  RichTextEditor,
  type RichTextEditorRef,
} from "@/components/ui/rich-text-editor";
import Link from "next/link";
import { toast } from "sonner";

interface TicketDetalhe {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  status_nome: string;
  status_cor: string;
  status_encerra: boolean;
  prioridade_nome: string;
  prioridade_cor: string;
  departamento_nome: string | null;
  categoria_nome: string | null;
  atribuido_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface Anexo {
  id: string;
  nome: string;
  url: string;
  tamanho: number | null;
  mime_type: string | null;
}

interface Mensagem {
  id: string;
  corpo: string;
  interna: boolean;
  criado_em: string;
  autor_id: string;
  autor_nome: string;
  autor_perfil: string;
  autor_avatar: string | null;
  anexos: Anexo[];
}

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase();
}

export default function TicketClientePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [ticket, setTicket] = useState<TicketDetalhe | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [detalheAberto, setDetalheAberto] = useState(false);
  const [confirmEncerrar, setConfirmEncerrar] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);

  const carregar = useCallback(async () => {
    const [resT, resM] = await Promise.all([
      fetch(`/api/tickets/${id}`),
      fetch(`/api/tickets/${id}/mensagens`),
    ]);
    if (!resT.ok) {
      router.push("/portal/meus-tickets");
      return;
    }
    setTicket(await resT.json());
    setMensagens(await resM.json());
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function enviarResposta(e: React.FormEvent) {
    e.preventDefault();
    const textoLimpo = resposta.replace(/<[^>]*>/g, "").trim();
    if (!textoLimpo) return;
    setEnviando(true);
    try {
      let res: Response;
      if (attachments.length > 0) {
        const fd = new FormData();
        fd.append("corpo", resposta);
        fd.append("interna", "false");
        for (const f of attachments) fd.append("arquivos", f);
        res = await fetch(`/api/tickets/${id}/mensagens`, {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(`/api/tickets/${id}/mensagens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corpo: resposta }),
        });
      }
      if (res.ok) {
        setResposta("");
        setAttachments([]);
        editorRef.current?.clear();
        await carregar();
      }
    } finally {
      setEnviando(false);
    }
  }

  async function encerrarTicket() {
    setEncerrando(true);
    try {
      const res = await fetch(`/api/tickets/${id}/encerrar`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Chamado encerrado com sucesso.");
        setConfirmEncerrar(false);
        await carregar();
      } else {
        const d = await res.json();
        toast.error(d.error ?? "Erro ao encerrar chamado.");
      }
    } finally {
      setEncerrando(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!ticket) return null;

  const breadcrumbParts = [
    ticket.departamento_nome,
    ticket.categoria_nome,
  ].filter(Boolean) as string[];

  return (
    <div
      className="-mx-4 -my-4 flex flex-col bg-gray-50"
      style={{ minHeight: "calc(100vh - 56px)" }}
    >
      {/* container centralizado com margens laterais maiores */}
      <div className="w-full px-12 py-12 flex flex-col gap-4">
        {/* ── Card: Header + Mais detalhes ─────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex-shrink-0">
          {/* Cabeçalho */}
          <div className="px-6 pt-5 pb-5 border-b border-gray-100">
            {/* Breadcrumb + botão voltar */}
            <nav className="flex items-center gap-2 flex-wrap mb-2">
              <Link
                href="/portal/meus-tickets"
                className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-sky-500 hover:text-sky-600 transition-colors"
              >
                <ArrowLeft size={13} />
                Chamados
              </Link>
              {breadcrumbParts.map((part) => (
                <span key={part} className="flex items-center gap-2">
                  <span className="text-xs text-gray-300">/</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {part}
                  </span>
                </span>
              ))}
            </nav>

            {/* Linha do título */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                #{ticket.numero} – {ticket.titulo}
              </h1>

              <div className="flex items-center gap-2 ml-auto flex-shrink-0 flex-wrap">
                {/* Badge status */}
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: ticket.status_cor + "18",
                    color: ticket.status_cor,
                    border: `1px solid ${ticket.status_cor}30`,
                  }}
                >
                  <span
                    className="inline-block rounded-full flex-shrink-0"
                    style={{
                      width: 7,
                      height: 7,
                      backgroundColor: ticket.status_cor,
                    }}
                  />
                  {ticket.status_nome}
                </span>

                {/* Data */}
                <span className="text-sm text-gray-500">
                  {format(new Date(ticket.criado_em), "dd/MM/yyyy HH:mm", {
                    locale: ptBR,
                  })}
                </span>

                {/* Botão encerrar */}
                {!ticket.status_encerra && (
                  <button
                    onClick={() => setConfirmEncerrar(true)}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: "#16a34a" }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.backgroundColor =
                        "#15803d")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.backgroundColor =
                        "#16a34a")
                    }
                  >
                    <XCircle size={15} />
                    Encerrar Chamado
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Mais detalhes (colapsível) */}
          <div>
            <button
              onClick={() => setDetalheAberto((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span>Mais detalhes</span>
              {detalheAberto ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>
            {detalheAberto && (
              <div className="px-6 pb-5 pt-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 border-t border-gray-100">
                {ticket.departamento_nome && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                      Departamento
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      {ticket.departamento_nome}
                    </p>
                  </div>
                )}
                {ticket.categoria_nome && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                      Categoria
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      {ticket.categoria_nome}
                    </p>
                  </div>
                )}
                {ticket.atribuido_nome && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                      Responsável
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      {ticket.atribuido_nome}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                    Prioridade
                  </p>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: ticket.prioridade_cor }}
                  >
                    {ticket.prioridade_nome}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                    Aberto em
                  </p>
                  <p className="text-sm font-medium text-gray-800">
                    {format(
                      new Date(ticket.criado_em),
                      "dd/MM/yyyy 'às' HH:mm",
                      { locale: ptBR },
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                    Atualizado em
                  </p>
                  <p className="text-sm font-medium text-gray-800">
                    {format(
                      new Date(ticket.atualizado_em),
                      "dd/MM/yyyy 'às' HH:mm",
                      { locale: ptBR },
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Card: Mensagens ──────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {mensagens.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">
              Nenhuma mensagem ainda.
            </p>
          )}
          {mensagens.map((m) => {
            const isCliente = m.autor_perfil === "cliente";
            return (
              <div
                key={m.id}
                className="flex items-start gap-4 px-6 py-5 border-b border-gray-100 last:border-b-0"
                style={{
                  backgroundColor: isCliente ? "#eff6ff" : "#ffffff",
                }}
              >
                {/* Avatar */}
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white select-none"
                  style={{
                    backgroundColor: isCliente ? "#0ea5e9" : "#6b7280",
                  }}
                >
                  {iniciais(m.autor_nome)}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: isCliente ? "#0369a1" : "#111827" }}
                    >
                      {m.autor_nome}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                      {format(new Date(m.criado_em), "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                  <div
                    className="text-sm text-gray-700 prose prose-sm max-w-none [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1"
                    dangerouslySetInnerHTML={{ __html: m.corpo }}
                  />
                  {m.anexos?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.anexos.map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 hover:opacity-80 transition-opacity"
                          style={{
                            backgroundColor: isCliente ? "#dbeafe" : "#f3f4f6",
                            color: isCliente ? "#1d4ed8" : "#4b5563",
                          }}
                        >
                          <Paperclip size={10} />
                          <span className="max-w-[140px] truncate">
                            {a.nome}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* ── Card: Caixa de resposta ──────────────────────────── */}
        {!ticket.status_encerra ? (
          <form
            onSubmit={enviarResposta}
            className="bg-white border border-gray-200 rounded-xl px-6 py-5 flex-shrink-0"
          >
            <RichTextEditor
              ref={editorRef}
              value={resposta}
              onChange={setResposta}
              onAttach={setAttachments}
              placeholder="Responder..."
              disabled={enviando}
            />
            <div className="flex items-center justify-end mt-3">
              <button
                type="submit"
                disabled={enviando || !resposta.replace(/<[^>]*>/g, "").trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#111827" }}
                onMouseEnter={(e) => {
                  if (!enviando)
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "#1f2937";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "#111827";
                }}
              >
                {enviando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 text-center text-sm text-gray-400 flex-shrink-0">
            Este chamado foi encerrado. Para continuar, abra um novo chamado.
          </div>
        )}
      </div>
      {/* fim container */}

      {/* ── Modal confirmar encerrar ────────────────────────────── */}
      {confirmEncerrar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmEncerrar(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Encerrar chamado?
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              O chamado será marcado como finalizado. Você poderá abrir um novo
              chamado caso precise de mais ajuda.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmEncerrar(false)}
                disabled={encerrando}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={encerrarTicket}
                disabled={encerrando}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60"
                style={{ backgroundColor: "#16a34a" }}
              >
                {encerrando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle size={15} />
                )}
                Encerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
