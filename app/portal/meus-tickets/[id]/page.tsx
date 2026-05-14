"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

interface AnexoTicket {
  id: string;
  nome: string;
  url: string;
  tamanho: number | null;
  mime_type: string | null;
  criado_em: string;
  enviado_por_nome: string;
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
  const [anexosTicket, setAnexosTicket] = useState<AnexoTicket[]>([]);
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
    const [resT, resM, resA] = await Promise.all([
      fetch(`/api/tickets/${id}`),
      fetch(`/api/tickets/${id}/mensagens`),
      fetch(`/api/tickets/${id}/anexos`),
    ]);
    if (!resT.ok) {
      router.push("/portal/meus-tickets");
      return;
    }
    setTicket(await resT.json());
    setMensagens(await resM.json());
    if (resA.ok) setAnexosTicket(await resA.json());
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
    } catch (error) {
      console.error("Erro na requisição:", error);
      toast.error("Erro de conexão com o servidor.");
    } finally {
      setEncerrando(false);
    }
  }

  // Sistema de cores para avatares (similar ao painel interno)
  const autorColorMap = useMemo(() => {
    if (!mensagens || mensagens.length === 0) return {};

    const USER_COLORS = [
      "#6366f1",
      "#8b5cf6",
      "#0d9488",
      "#f43f5e",
      "#f97316",
      "#0891b2",
      "#10b981",
      "#ec4899",
      "#84cc16",
      "#eab308",
    ];
    const autorIds = [...new Set(mensagens.map((m) => m.autor_id))];
    return Object.fromEntries(
      autorIds.map((aid, i) => [aid, USER_COLORS[i % USER_COLORS.length]]),
    );
  }, [mensagens]);

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
    <>
      {/* ═══ LAYOUT PRINCIPAL ═══ */}
      <div className="flex h-full overflow-hidden">
        {/* ── Coluna central ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Cabeçalho */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
            <Link
              href="/portal/meus-tickets"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={14} />
              Meus Chamados
            </Link>
            <span className="text-gray-200 select-none">|</span>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-gray-900 truncate">
                #{ticket.numero} — {ticket.titulo}
              </h1>
            </div>

            {/* Botões */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border"
                style={{
                  color: ticket.status_cor,
                  borderColor: ticket.status_cor + "55",
                  backgroundColor: ticket.status_cor + "15",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: ticket.status_cor }}
                />
                {ticket.status_nome}
              </span>

              <span className="text-xs text-gray-400">
                {format(new Date(ticket.criado_em), "dd/MM/yyyy HH:mm", {
                  locale: ptBR,
                })}
              </span>

              {!ticket.status_encerra && (
                <button
                  type="button"
                  onClick={() => setConfirmEncerrar(true)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-green-700 border border-green-300 bg-white hover:bg-green-50 hover:border-green-500 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <XCircle size={13} />
                  Encerrar
                </button>
              )}
            </div>
          </div>

          {/* ── Mensagens (área scrollável) ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-1 max-w-3xl">
              {mensagens.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-10">
                  Nenhuma mensagem ainda.
                </p>
              )}
              {mensagens.map((m) => {
                const isOperador = m.autor_perfil !== "cliente";
                const inicial = m.autor_nome?.charAt(0).toUpperCase() ?? "?";
                const avatarColor = autorColorMap[m.autor_id] ?? "#9ca3af";

                return (
                  <div key={m.id} className="flex items-start gap-3 py-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white select-none mt-0.5"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {inicial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-gray-900">
                          {m.autor_nome}
                        </span>
                        <span className="text-xs text-gray-400">
                          {format(new Date(m.criado_em), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                          {isOperador && " · Atendente"}
                        </span>
                      </div>
                      <div
                        className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                          isOperador
                            ? "bg-white border border-gray-200 border-l-[3px] border-l-blue-400"
                            : "bg-gray-50 border border-gray-100"
                        }`}
                      >
                        <div
                          className="prose prose-sm max-w-none text-gray-800 [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1"
                          dangerouslySetInnerHTML={{ __html: m.corpo }}
                        />
                      </div>
                      {m.anexos?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.anexos.map((a) => (
                            <a
                              key={a.id}
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-blue-600 hover:bg-gray-200 rounded px-2.5 py-1 transition-colors"
                            >
                              <Paperclip
                                size={10}
                                className="text-gray-400 flex-shrink-0"
                              />
                              <span className="max-w-[200px] truncate">
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
          </div>

          {/* ── Formulário de resposta (fixo no rodapé) ── */}
          {!ticket.status_encerra ? (
            <div className="flex-shrink-0 border-t border-gray-200 bg-white">
              <form
                onSubmit={enviarResposta}
                className="bg-white px-4 pt-3 pb-2"
              >
                <RichTextEditor
                  ref={editorRef}
                  value={resposta}
                  onChange={setResposta}
                  onAttach={setAttachments}
                  placeholder="Escreva sua mensagem..."
                  disabled={enviando}
                />
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Ctrl+Enter para enviar</p>
                  <button
                    type="submit"
                    disabled={enviando || !resposta.replace(/<[^>]*>/g, "").trim()}
                    className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {enviando ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Enviar
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex-shrink-0 border-t border-gray-200 bg-white px-5 py-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-6 py-4 text-center text-sm text-gray-400">
                Este chamado foi encerrado. Para continuar, abra um novo chamado.
              </div>
            </div>
          )}
        </div>

        {/* ═══ PAINEL LATERAL ═══ */}
        <aside className="w-72 border-l border-gray-200 flex-shrink-0 overflow-y-auto bg-white">
          {/* INFORMAÇÕES */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Informações
            </p>
            <div className="space-y-3.5">
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Protocolo</p>
                <p className="text-sm font-mono font-medium text-gray-800">
                  #{ticket.numero}
                </p>
              </div>

              {ticket.departamento_nome && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">
                    Departamento
                  </p>
                  <p className="text-sm text-gray-800">
                    {ticket.departamento_nome}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Categoria</p>
                <p className="text-sm text-gray-800">
                  {ticket.categoria_nome ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Responsável</p>
                {ticket.atribuido_nome ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: "#3b82f6" }}
                    >
                      {ticket.atribuido_nome.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-gray-800">
                      {ticket.atribuido_nome}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Não atribuído</p>
                )}
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Status</p>
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border"
                  style={{
                    color: ticket.status_cor,
                    borderColor: ticket.status_cor + "55",
                    backgroundColor: ticket.status_cor + "15",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: ticket.status_cor }}
                  />
                  {ticket.status_nome}
                </span>
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Prioridade</p>
                <span
                  className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border"
                  style={{
                    color: ticket.prioridade_cor,
                    borderColor: ticket.prioridade_cor + "55",
                    backgroundColor: ticket.prioridade_cor + "15",
                  }}
                >
                  {ticket.prioridade_nome}
                </span>
              </div>
            </div>
          </div>

          {/* HISTÓRICO */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Histórico
            </p>
            <div className="space-y-3">
              {ticket.atribuido_nome && (
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 mt-1 flex-shrink-0" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Chamado atribuído a{" "}
                    <span className="font-medium">{ticket.atribuido_nome}</span>
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-green-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Chamado aberto
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {format(new Date(ticket.criado_em), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
              </div>
              {ticket.atualizado_em !== ticket.criado_em && (
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-gray-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Última atualização
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {format(new Date(ticket.atualizado_em), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ANEXOS DO CHAMADO */}
          {anexosTicket.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
                Anexos do chamado
              </p>
              <div className="space-y-2">
                {anexosTicket.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-xs rounded-md px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors group"
                  >
                    <Paperclip size={12} className="text-gray-400 group-hover:text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{a.nome}</p>
                      {a.tamanho && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {a.tamanho < 1024
                            ? `${a.tamanho} B`
                            : a.tamanho < 1024 * 1024
                              ? `${Math.round(a.tamanho / 1024)} KB`
                              : `${(a.tamanho / (1024 * 1024)).toFixed(1)} MB`}
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

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
    </>
  );
}
