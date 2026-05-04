"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Loader2,
  Send,
  CheckCircle2,
  X,
  CornerUpLeft,
  Clock,
  FileText,
  Wrench,
  Headphones,
  LayoutTemplate,
  ClipboardList,
  ArrowRightLeft,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RichTextEditor,
  type RichTextEditorRef,
} from "@/components/ui/rich-text-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import { toast } from "sonner";

interface SolicitacaoDetalhe {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prazo: string | null;
  fechado_em: string | null;
  criado_em: string;
  atualizado_em: string;
  tipo_id: string;
  tipo_nome: string;
  tipo_icone: string | null;
  tipo_cor: string;
  prioridade_id: string | null;
  prioridade_nome: string | null;
  prioridade_cor: string | null;
  solicitante_id: string;
  solicitante_nome: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  departamento_id: string | null;
  departamento_nome: string | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  subcategoria_id: string | null;
  subcategoria_nome: string | null;
}

interface Mensagem {
  id: string;
  corpo: string;
  criado_em: string;
  autor_id: string;
  autor_nome: string;
  autor_perfil: string;
}

interface Departamento { id: string; nome: string; }
interface Usuario { id: string; nome: string; perfil: string; }
interface Prioridade { id: string; nome: string; cor: string; }
interface Categoria { id: string; nome: string; }
interface Subcategoria { id: string; nome: string; }

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em Andamento",
  aguardando: "Aguardando",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  aberta: "#3B82F6",
  em_andamento: "#F59E0B",
  aguardando: "#8B5CF6",
  concluida: "#10B981",
  cancelada: "#6B7280",
};

function TipoIcone({ icone, size = 13 }: { icone: string | null; size?: number }) {
  const props = { size };
  switch (icone) {
    case "file-text":  return <FileText {...props} />;
    case "wrench":     return <Wrench {...props} />;
    case "headphones": return <Headphones {...props} />;
    case "layout":     return <LayoutTemplate {...props} />;
    default:           return <ClipboardList {...props} />;
  }
}

const USER_COLORS = ["#6366f1","#8b5cf6","#0d9488","#f43f5e","#f97316","#0891b2","#10b981","#ec4899","#84cc16","#eab308"];

// Funções para conversão de data
function formatDateToBR(isoDate: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

function formatDateToISO(brDate: string): string {
  if (!brDate) return "";
  const [day, month, year] = brDate.split("/");
  if (!day || !month || !year) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function handleDateInput(value: string, setter: (value: string) => void): void {
  // Remove tudo exceto números
  const numbers = value.replace(/\D/g, "");

  let formatted = "";
  if (numbers.length >= 1) {
    formatted = numbers.substring(0, 2);
  }
  if (numbers.length >= 3) {
    formatted += "/" + numbers.substring(2, 4);
  }
  if (numbers.length >= 5) {
    formatted += "/" + numbers.substring(4, 8);
  }

  setter(formatted);
}

export default function SolicitacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [solicitacao, setSolicitacao] = useState<SolicitacaoDetalhe | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  // Transferir
  const [transferirAberto, setTransferirAberto] = useState(false);
  const [transferirResponsavel, setTransferirResponsavel] = useState("");
  const [transferirDepartamento, setTransferirDepartamento] = useState("");
  const [transferindo, setTransferindo] = useState(false);

  // Concluir com motivo
  const [concluirAberto, setConcluirAberto] = useState(false);
  const [concluirMotivo, setConcluirMotivo] = useState("");
  const [concluindo, setConcluindo] = useState(false);

  // Cancelar com motivo
  const [cancelarAberto, setCancelarAberto] = useState(false);
  const [cancelarMotivo, setCancelarMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);

  // Modal de edição
  const [editarAberto, setEditarAberto] = useState(false);
  const [editarTitulo, setEditarTitulo] = useState("");
  const [editarDepartamentoId, setEditarDepartamentoId] = useState("");
  const [editarCategoriaId, setEditarCategoriaId] = useState("");
  const [editarSubcategoriaId, setEditarSubcategoriaId] = useState("");
  const [editarPrioridadeId, setEditarPrioridadeId] = useState("");
  const [editarResponsavelId, setEditarResponsavelId] = useState("");
  const [editarPrazo, setEditarPrazo] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);
  const concluirEditorRef = useRef<RichTextEditorRef>(null);
  const cancelarEditorRef = useRef<RichTextEditorRef>(null);

  const carregar = useCallback(async () => {
    const [resS, resM] = await Promise.all([
      fetch(`/api/solicitacoes/${id}`),
      fetch(`/api/solicitacoes/${id}/mensagens`),
    ]);
    if (!resS.ok) { router.push("/painel/solicitacoes"); return; }
    setSolicitacao(await resS.json());
    if (resM.ok) setMensagens(await resM.json());
    setLoading(false);
  }, [id, router]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    Promise.all([
      fetch("/api/departamentos?pageSize=50").then((r) => r.json()),
      fetch("/api/usuarios?pageSize=50").then((r) => r.json()),
      fetch("/api/ticket-prioridades").then((r) => r.json()),
    ]).then(([d, u, p]) => {
      setDepartamentos(Array.isArray(d) ? d : (d.data ?? []));
      setUsuarios(Array.isArray(u) ? u : (u.data ?? []));
      setPrioridades(Array.isArray(p) ? p : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // Carregar categorias quando departamento mudar no modal de edição (apenas para mudanças do usuário)
  useEffect(() => {
    if (!editarAberto || !editarDepartamentoId) {
      return;
    }

    // Só recarregar se o modal já estava aberto (mudança pelo usuário)
    const timeoutId = setTimeout(() => {
      fetch(`/api/categorias?departamento_id=${editarDepartamentoId}&pageSize=100`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d) => {
          setCategorias(d.data ?? []);
          setEditarCategoriaId("");
          setEditarSubcategoriaId("");
          setSubcategorias([]);
        })
        .catch(() => {});
    }, 100); // Delay para não interferir com o carregamento inicial

    return () => clearTimeout(timeoutId);
  }, [editarDepartamentoId]); // Removemos editarAberto da dependência

  // Carregar subcategorias quando categoria mudar no modal de edição (apenas para mudanças do usuário)
  useEffect(() => {
    if (!editarAberto || !editarCategoriaId) {
      return;
    }

    // Só recarregar se o modal já estava aberto (mudança pelo usuário)
    const timeoutId = setTimeout(() => {
      fetch(`/api/subcategorias?categoria_id=${editarCategoriaId}&pageSize=100`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d) => {
          setSubcategorias(d.data ?? []);
          setEditarSubcategoriaId("");
        })
        .catch(() => {});
    }, 100); // Delay para não interferir com o carregamento inicial

    return () => clearTimeout(timeoutId);
  }, [editarCategoriaId]); // Removemos editarAberto da dependência

  async function enviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    const textoLimpo = resposta.replace(/<[^>]*>/g, "").trim();
    if (!textoLimpo) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/solicitacoes/${id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpo: resposta }),
      });
      if (res.ok) {
        setResposta("");
        editorRef.current?.clear();
        await carregar();
      }
    } finally {
      setEnviando(false);
    }
  }

  async function atualizarStatus(novoStatus: string) {
    setSalvandoStatus(true);
    await fetch(`/api/solicitacoes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    });
    await carregar();
    setSalvandoStatus(false);
  }

  async function atualizarCampo(campo: string, valor: string | null) {
    await fetch(`/api/solicitacoes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valor }),
    });
    await carregar();
  }

  async function abrirModalEditar() {
    if (!solicitacao) return;

    setEditarTitulo(solicitacao.titulo);
    setEditarPrioridadeId(solicitacao.prioridade_id ?? "");
    setEditarResponsavelId(solicitacao.responsavel_id ?? "");
    setEditarPrazo(solicitacao.prazo ? formatDateToBR(solicitacao.prazo) : "");

    // Primeiro definir o departamento
    setEditarDepartamentoId(solicitacao.departamento_id ?? "");

    // Se tem departamento, carregar categorias antes de definir valores
    if (solicitacao.departamento_id) {
      try {
        const resCateg = await fetch(`/api/categorias?departamento_id=${solicitacao.departamento_id}&pageSize=100`);
        const dataCateg = await resCateg.json();
        setCategorias(dataCateg.data ?? []);

        // Agora definir a categoria
        setEditarCategoriaId(solicitacao.categoria_id ?? "");

        // Se tem categoria, carregar subcategorias
        if (solicitacao.categoria_id) {
          const resSub = await fetch(`/api/subcategorias?categoria_id=${solicitacao.categoria_id}&pageSize=100`);
          const dataSub = await resSub.json();
          setSubcategorias(dataSub.data ?? []);

          // Agora definir a subcategoria
          setEditarSubcategoriaId(solicitacao.subcategoria_id ?? "");
        } else {
          setSubcategorias([]);
          setEditarSubcategoriaId("");
        }
      } catch (error) {
        console.error("Erro ao carregar categorias:", error);
      }
    } else {
      setCategorias([]);
      setSubcategorias([]);
      setEditarCategoriaId("");
      setEditarSubcategoriaId("");
    }

    setEditarAberto(true);
  }

  async function salvarEdicao() {
    if (!editarTitulo.trim()) return;
    setSalvandoEdicao(true);

    try {
      const res = await fetch(`/api/solicitacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: editarTitulo.trim(),
          departamento_dest: editarDepartamentoId || null,
          categoria_id: editarCategoriaId || null,
          subcategoria_id: editarSubcategoriaId || null,
          prioridade_id: editarPrioridadeId || null,
          responsavel_id: editarResponsavelId || null,
          prazo: editarPrazo ? formatDateToISO(editarPrazo) : null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(errorData.error || `Erro ${res.status}: ${res.statusText}`);
      }

      setEditarAberto(false);
      await carregar();
      toast.success("Solicitação atualizada com sucesso");
    } catch (error) {
      console.error("Erro ao salvar edição:", error);
      toast.error(`Erro ao atualizar solicitação: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function handleTransferir() {
    setTransferindo(true);
    try {
      await fetch(`/api/solicitacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsavel_id: transferirResponsavel || null,
          departamento_dest: transferirDepartamento || null,
        }),
      });
      setTransferirAberto(false);
      await carregar();
    } finally {
      setTransferindo(false);
    }
  }

  async function handleConcluir() {
    const textoLimpo = concluirMotivo.replace(/<[^>]*>/g, "").trim();
    if (!textoLimpo) return;
    setConcluindo(true);
    try {
      await fetch(`/api/solicitacoes/${id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpo: concluirMotivo }),
      });
      await atualizarStatus("concluida");
      setConcluirAberto(false);
      setConcluirMotivo("");
      concluirEditorRef.current?.clear();
    } finally {
      setConcluindo(false);
    }
  }

  async function handleCancelar() {
    const textoLimpo = cancelarMotivo.replace(/<[^>]*>/g, "").trim();
    if (!textoLimpo) return;
    setCancelando(true);
    try {
      await fetch(`/api/solicitacoes/${id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpo: cancelarMotivo }),
      });
      await atualizarStatus("cancelada");
      setCancelarAberto(false);
      setCancelarMotivo("");
      cancelarEditorRef.current?.clear();
    } finally {
      setCancelando(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!solicitacao) return null;

  const isEncerrada = ["concluida", "cancelada"].includes(solicitacao.status);
  const autorIds = [...new Set(mensagens.map((m) => m.autor_id))];
  const autorColorMap: Record<string, string> = Object.fromEntries(
    autorIds.map((aid, i) => [aid, USER_COLORS[i % USER_COLORS.length]])
  );

  return (
    <>
      <div className="-m-6 flex overflow-hidden" style={{ height: "calc(100% + 3rem)" }}>
        {/* ── Coluna central ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Cabeçalho */}
          <div className="px-5 pt-3 pb-2.5 border-b border-gray-200 bg-white flex-shrink-0">
            {/* Linha 1: breadcrumb + ações */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <Link
                href="/painel/solicitacoes"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
              >
                <ArrowLeft size={14} />
                Solicitações
              </Link>

              {/* Ações */}
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => abrirModalEditar()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-400 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <Pencil size={13} />
                  Editar
                </button>
                {isEncerrada ? (
                  <button
                    type="button"
                    onClick={() => atualizarStatus("aberta")}
                    disabled={salvandoStatus}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-400 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {salvandoStatus ? <Loader2 size={13} className="animate-spin" /> : <CornerUpLeft size={13} />}
                    Reabrir
                  </button>
                ) : (
                  <>
                    {solicitacao.status !== "em_andamento" && (
                      <button
                        type="button"
                        onClick={() => atualizarStatus("em_andamento")}
                        disabled={salvandoStatus}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 border border-amber-200 bg-white hover:bg-amber-50 hover:border-amber-400 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {salvandoStatus ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                        Em Andamento
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConcluirAberto(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 border border-green-300 bg-white hover:bg-green-50 hover:border-green-500 rounded-md px-2.5 py-1.5 transition-colors"
                    >
                      <CheckCircle2 size={13} />
                      Concluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelarAberto(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 border border-orange-200 bg-white hover:bg-orange-50 hover:border-orange-400 rounded-md px-2.5 py-1.5 transition-colors"
                    >
                      <X size={13} />
                      Cancelar
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTransferirResponsavel(solicitacao.responsavel_id ?? "");
                    setTransferirDepartamento(solicitacao.departamento_id ?? "");
                    setTransferirAberto(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 border border-purple-200 bg-white hover:bg-purple-50 hover:border-purple-400 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <ArrowRightLeft size={13} />
                  Transferir
                </button>
              </div>
            </div>

            {/* Linha 2: tipo + título + status */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0"
                style={{
                  color: solicitacao.tipo_cor,
                  borderColor: solicitacao.tipo_cor + "55",
                  backgroundColor: solicitacao.tipo_cor + "15",
                }}
              >
                <TipoIcone icone={solicitacao.tipo_icone} size={11} />
                {solicitacao.tipo_nome}
              </span>
              <h1 className="text-sm font-semibold text-gray-900">
                {solicitacao.titulo}
              </h1>
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border flex-shrink-0"
                style={{
                  color: STATUS_COLORS[solicitacao.status],
                  borderColor: STATUS_COLORS[solicitacao.status] + "55",
                  backgroundColor: STATUS_COLORS[solicitacao.status] + "15",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[solicitacao.status] }} />
                {STATUS_LABELS[solicitacao.status]}
              </span>
            </div>
          </div>

          {/* ── Mensagens (área scrollável) ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-1 max-w-3xl">
              {/* Descrição inicial como primeira mensagem */}
              {solicitacao.descricao && (
                <div className="flex items-start gap-3 py-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white select-none mt-0.5"
                    style={{ backgroundColor: "#6366f1" }}
                  >
                    {solicitacao.solicitante_nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-gray-900">{solicitacao.solicitante_nome}</span>
                      <span className="text-xs text-gray-400">
                        {format(new Date(solicitacao.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {" · Solicitante"}
                      </span>
                    </div>
                    <div className="rounded-lg px-4 py-3 text-sm leading-relaxed bg-gray-50 border border-gray-100">
                      <div
                        className="prose prose-sm max-w-none text-gray-800 [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1"
                        dangerouslySetInnerHTML={{ __html: solicitacao.descricao }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mensagens */}
              {[...mensagens].reverse().map((m) => {
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
                        <span className="text-sm font-semibold text-gray-900">{m.autor_nome}</span>
                        <span className="text-xs text-gray-400">
                          {format(new Date(m.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="rounded-lg px-4 py-3 text-sm leading-relaxed bg-white border border-gray-200 border-l-[3px] border-l-blue-400">
                        <div
                          className="prose prose-sm max-w-none text-gray-800 [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1"
                          dangerouslySetInnerHTML={{ __html: m.corpo }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* ── Formulário de resposta ── */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-white">
            {isEncerrada ? (
              <div className="px-5 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Solicitação {STATUS_LABELS[solicitacao.status].toLowerCase()}.
                </p>
                <button
                  onClick={() => atualizarStatus("aberta")}
                  disabled={salvandoStatus}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
                >
                  <CornerUpLeft size={13} />
                  Reabrir
                </button>
              </div>
            ) : (
              <form onSubmit={enviarMensagem}>
                <div className="flex border-b border-gray-100 px-1">
                  <span className="px-4 py-2.5 text-sm font-medium border-b-2 border-gray-800 text-gray-900">
                    Responder
                  </span>
                </div>
                <div className="px-4 pt-3 pb-2">
                  <RichTextEditor
                    ref={editorRef}
                    value={resposta}
                    onChange={setResposta}
                    placeholder="Escreva uma mensagem..."
                    disabled={enviando}
                  />
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Ctrl+Enter para enviar</p>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={enviando || !resposta.replace(/<[^>]*>/g, "").trim()}
                  >
                    {enviando ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                    Enviar
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* ═══ PAINEL LATERAL ═══ */}
        <aside className="w-72 border-l border-gray-200 flex-shrink-0 overflow-y-auto bg-white">
          {/* INFORMAÇÕES */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Informações</p>
            <div className="space-y-3.5">
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Tipo</p>
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border"
                  style={{ color: solicitacao.tipo_cor, borderColor: solicitacao.tipo_cor + "55", backgroundColor: solicitacao.tipo_cor + "15" }}
                >
                  <TipoIcone icone={solicitacao.tipo_icone} size={11} />
                  {solicitacao.tipo_nome}
                </span>
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Solicitante</p>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: "#6366f1" }}>
                    {solicitacao.solicitante_nome.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-800">{solicitacao.solicitante_nome}</span>
                </div>
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Responsável</p>
                <span className="text-sm text-gray-800">
                  {solicitacao.responsavel_nome ?? "Não atribuído"}
                </span>
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-1">Departamento</p>
                <span className="text-sm text-gray-800">
                  {solicitacao.departamento_nome ?? "Nenhum"}
                </span>
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Categoria</p>
                <span className="text-sm text-gray-800">
                  {solicitacao.categoria_nome ?? "Não definida"}
                </span>
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Subcategoria</p>
                <span className="text-sm text-gray-800">
                  {solicitacao.subcategoria_nome ?? "Não definida"}
                </span>
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Prioridade</p>
                {solicitacao.prioridade_nome ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border"
                    style={{
                      color: solicitacao.prioridade_cor || "#6B7280",
                      borderColor: (solicitacao.prioridade_cor || "#6B7280") + "55",
                      backgroundColor: (solicitacao.prioridade_cor || "#6B7280") + "15",
                    }}
                  >
                    {solicitacao.prioridade_nome}
                  </span>
                ) : (
                  <span className="text-sm text-gray-800">Normal</span>
                )}
              </div>

              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Prazo</p>
                <span className="text-sm text-gray-800">
                  {solicitacao.prazo
                    ? format(new Date(solicitacao.prazo), "dd/MM/yyyy", { locale: ptBR })
                    : "Sem prazo definido"
                  }
                </span>
              </div>
            </div>
          </div>

          {/* HISTÓRICO */}
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Histórico</p>
            <div className="space-y-3">
              {solicitacao.responsavel_nome && (
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400 mt-1 flex-shrink-0" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Atribuído a <span className="font-medium">{solicitacao.responsavel_nome}</span>
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-green-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Aberto por <span className="font-medium">{solicitacao.solicitante_nome}</span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {format(new Date(solicitacao.criado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
              {solicitacao.fechado_em && (
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-gray-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {solicitacao.status === "concluida" ? "Concluído" : "Cancelado"}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {format(new Date(solicitacao.fechado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ═══ MODAL — Transferir ═══ */}
      <Dialog open={transferirAberto} onOpenChange={setTransferirAberto}>
        <DialogContent showCloseButton={false} className="max-w-lg p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900 truncate pr-4">
              Transferir: {solicitacao.titulo}
            </DialogTitle>
            <button type="button" onClick={() => setTransferirAberto(false)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0">
              <X size={16} />
            </button>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 w-28">Departamento:</span>
              <select value={transferirDepartamento} onChange={(e) => setTransferirDepartamento(e.target.value)} className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Nenhum</option>
                {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 w-28">Responsável:</span>
              <select value={transferirResponsavel} onChange={(e) => setTransferirResponsavel(e.target.value)} className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Não atribuído</option>
                {usuarios.filter((u) => u.perfil !== "cliente").map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <button type="button" onClick={handleTransferir} disabled={transferindo} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50">
              {transferindo && <Loader2 size={14} className="animate-spin" />}
              Transferir
            </button>
            <button type="button" onClick={() => setTransferirAberto(false)} className="inline-flex items-center text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-4 py-2 transition-colors">
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL — Concluir ═══ */}
      <Dialog open={concluirAberto} onOpenChange={setConcluirAberto}>
        <DialogContent showCloseButton={false} className="max-w-lg p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900">Concluir Solicitação</DialogTitle>
            <button type="button" onClick={() => setConcluirAberto(false)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Mensagem de conclusão:</p>
              <RichTextEditor ref={concluirEditorRef} value={concluirMotivo} onChange={setConcluirMotivo} placeholder="Descreva como a solicitação foi atendida..." disabled={concluindo} />
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <button type="button" onClick={handleConcluir} disabled={concluindo || !concluirMotivo.replace(/<[^>]*>/g, "").trim()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {concluindo && <Loader2 size={14} className="animate-spin" />}
              Concluir
            </button>
            <button type="button" onClick={() => setConcluirAberto(false)} className="inline-flex items-center text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-4 py-2 transition-colors">
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL — Cancelar ═══ */}
      <Dialog open={cancelarAberto} onOpenChange={setCancelarAberto}>
        <DialogContent showCloseButton={false} className="max-w-lg p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900">Cancelar Solicitação</DialogTitle>
            <button type="button" onClick={() => setCancelarAberto(false)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Motivo do cancelamento:</p>
              <RichTextEditor ref={cancelarEditorRef} value={cancelarMotivo} onChange={setCancelarMotivo} placeholder="Descreva o motivo do cancelamento..." disabled={cancelando} />
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleCancelar} disabled={cancelando || !cancelarMotivo.replace(/<[^>]*>/g, "").trim()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {cancelando && <Loader2 size={14} className="animate-spin" />}
                Cancelar Solicitação
              </button>
              <button type="button" onClick={() => setCancelarAberto(false)} className="inline-flex items-center text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-4 py-2 transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL — Editar Solicitação ═══ */}
      <Dialog open={editarAberto} onOpenChange={setEditarAberto}>
        <DialogContent showCloseButton={false} className="max-w-lg p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900 truncate pr-4">
              Editar Solicitação: {solicitacao?.titulo}
            </DialogTitle>
            <button
              type="button"
              onClick={() => setEditarAberto(false)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Título */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título
              </label>
              <input
                type="text"
                value={editarTitulo}
                onChange={(e) => setEditarTitulo(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Digite o título da solicitação"
              />
            </div>

            {/* Departamento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Departamento destino
              </label>
              <select
                value={editarDepartamentoId}
                onChange={(e) => {
                  setEditarDepartamentoId(e.target.value);
                  setEditarCategoriaId("");
                  setEditarSubcategoriaId("");
                }}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Nenhum</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Categoria */}
            {editarDepartamentoId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoria
                </label>
                {categorias.length === 0 ? (
                  <div className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-400 bg-gray-50">
                    Nenhuma categoria disponível
                  </div>
                ) : (
                  <select
                    value={editarCategoriaId}
                    onChange={(e) => {
                      setEditarCategoriaId(e.target.value);
                      setEditarSubcategoriaId("");
                    }}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Selecione...</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Subcategoria */}
            {editarCategoriaId && subcategorias.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subcategoria
                </label>
                <select
                  value={editarSubcategoriaId}
                  onChange={(e) => setEditarSubcategoriaId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Selecione...</option>
                  {subcategorias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Responsável */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsável
              </label>
              <select
                value={editarResponsavelId}
                onChange={(e) => setEditarResponsavelId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Não atribuído</option>
                {usuarios.filter((u) => u.perfil !== "cliente").map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Prioridade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prioridade
              </label>
              <select
                value={editarPrioridadeId}
                onChange={(e) => setEditarPrioridadeId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Normal</option>
                {prioridades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Prazo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prazo
              </label>
              <input
                type="text"
                value={editarPrazo}
                onChange={(e) => handleDateInput(e.target.value, setEditarPrazo)}
                placeholder="DD/MM/AAAA"
                maxLength={10}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <button
              type="button"
              onClick={salvarEdicao}
              disabled={salvandoEdicao || !editarTitulo.trim()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvandoEdicao ? <Loader2 size={14} className="animate-spin" /> : null}
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditarAberto(false)}
              className="inline-flex items-center text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-4 py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
