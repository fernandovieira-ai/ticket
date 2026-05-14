"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClientDate } from "@/components/ui/client-date";
import {
  ArrowLeft,
  Loader2,
  Send,
  Lock,
  User,
  Building2,
  Tag,
  ChevronDown,
  Paperclip,
  CornerUpLeft,
  X,
  Trash2,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  CheckCircle2,
  ArrowRightLeft,
  Smartphone,
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

interface TicketDetalhe {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  canal: string;
  status_id: string;
  status_nome: string;
  status_cor: string;
  status_encerra: boolean;
  prioridade_id: string;
  prioridade_nome: string;
  prioridade_cor: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  atribuido_a: string | null;
  atribuido_nome: string | null;
  aberto_por: string;
  aberto_por_nome: string;
  departamento_id: string | null;
  departamento_nome: string | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  subcategoria_id: string | null;
  subcategoria_nome: string | null;
  criado_em: string;
  atualizado_em: string;
  sla_primeira_resp_deadline: string | null;
  sla_resolucao_deadline: string | null;
  sla_alerta_pct: number;
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

interface StatusOpcao {
  id: string;
  codigo: string;
  nome: string;
  cor: string;
  encerra: boolean;
}
interface PrioridadeOpcao {
  id: string;
  nome: string;
  cor: string;
}
interface UsuarioOpcao {
  id: string;
  nome: string;
  perfil: string;
  ativo?: boolean;
}
interface DepartamentoOpcao {
  id: string;
  nome: string;
}
interface ClienteDetalhe {
  email: string | null;
  telefone: string | null;
  documento: string | null;
  segmento: string | null;
}
interface CategoriaOpcao {
  id: string;
  nome: string;
}
interface SubcategoriaOpcao {
  id: string;
  nome: string;
}

// Performance cache class for ticket details
class TicketDetailsCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private requests = new Map<string, Promise<any>>();

  private isExpired(item: { timestamp: number; ttl: number }): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item || this.isExpired(item)) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  set(key: string, data: any, ttlMs = 300000): void { // 5min default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  async fetchWithCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300000): Promise<T> {
    // Check cache first
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    // Check if request is in flight
    if (this.requests.has(key)) {
      return this.requests.get(key);
    }

    // Make new request
    const promise = fetcher().then((data) => {
      this.set(key, data, ttlMs);
      this.requests.delete(key);
      return data;
    }).catch((error) => {
      this.requests.delete(key);
      throw error;
    });

    this.requests.set(key, promise);
    return promise;
  }

  // Check for prefetched data from the tickets list
  getPrefetched(ticketId: string): any {
    return this.get(`ticket_details_${ticketId}`);
  }

  // Clear specific cache entry
  clearCache(key: string): void {
    this.cache.delete(key);
    this.requests.delete(key);
  }
}

const detailsCache = new TicketDetailsCache();

// Export prefetch function for use by tickets list
export function prefetchTicketDetails(ticketId: string): void {
  // Start prefetching ticket details in the background
  detailsCache.fetchWithCache(
    `ticket_details_${ticketId}`,
    async () => {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (!res.ok) throw new Error('Ticket not found');
      return res.json();
    },
    180000 // 3min
  ).catch(() => {}); // Silent fail for prefetch

  // Also prefetch messages
  detailsCache.fetchWithCache(
    `ticket_messages_${ticketId}`,
    async () => {
      const res = await fetch(`/api/tickets/${ticketId}/mensagens`);
      return res.ok ? res.json() : [];
    },
    60000 // 1min
  ).catch(() => {}); // Silent fail for prefetch
}

export default function TicketPainelPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [ticket, setTicket] = useState<TicketDetalhe | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [statusOpcoes, setStatusOpcoes] = useState<StatusOpcao[]>([]);
  const [prioridadeOpcoes, setPrioridadeOpcoes] = useState<PrioridadeOpcao[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [resposta, setResposta] = useState("");
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [respostaMsgId, setRespostaMsgId] = useState<string | null>(null);
  const [perfilUsuario, setPerfilUsuario] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [finalizarAberto, setFinalizarAberto] = useState(false);
  const [finalizarMotivo, setFinalizarMotivo] = useState("");
  const [finalizarHH, setFinalizarHH] = useState("");
  const [finalizarMM, setFinalizarMM] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);
  const [cancelarMotivo, setCancelarMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [confirmarReaberturaAberto, setConfirmarReaberturaAberto] = useState(false);
  const [enviarViaWhatsapp, setEnviarViaWhatsapp] = useState(false);
  const [transferirAberto, setTransferirAberto] = useState(false);
  const [transferirTipo, setTransferirTipo] = useState<
    "atendente" | "departamento"
  >("atendente");
  const [transferirAtendente, setTransferirAtendente] = useState("");
  const [transferirDepartamento, setTransferirDepartamento] = useState("");
  const [transferindo, setTransferindo] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcao[]>([]);
  const [categorias, setCategorias] = useState<CategoriaOpcao[]>([]);
  const [subcategorias, setSubcategorias] = useState<SubcategoriaOpcao[]>([]);
  function htmlToTexto(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function textoToHtml(texto: string): string {
    const linhas = texto.split(/\n/);
    const paragrafos: string[] = [];
    let bloco = "";
    for (const linha of linhas) {
      if (linha.trim() === "") {
        if (bloco) {
          paragrafos.push(`<p>${bloco}</p>`);
          bloco = "";
        }
        paragrafos.push("<p><br></p>");
      } else {
        bloco = bloco ? `${bloco}<br>${linha}` : linha;
      }
    }
    if (bloco) paragrafos.push(`<p>${bloco}</p>`);
    return paragrafos.join("");
  }

  const [editarAberto, setEditarAberto] = useState(false);
  const [editarTitulo, setEditarTitulo] = useState("");
  const [editarDepartamentoId, setEditarDepartamentoId] = useState("");
  const [editarCategoriaId, setEditarCategoriaId] = useState("");
  const [editarSubcategoriaId, setEditarSubcategoriaId] = useState("");
  const [editarPrioridadeId, setEditarPrioridadeId] = useState("");
  const [editarAtribuidoA, setEditarAtribuidoA] = useState("");
  const [editarDescricao, setEditarDescricao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const finalizarEditorRef = useRef<RichTextEditorRef>(null);
  const cancelarEditorRef = useRef<RichTextEditorRef>(null);
  const [statusAberto, setStatusAberto] = useState(false);
  const [prioridadeAberta, setPrioridadeAberta] = useState(false);
  const [clienteExpandido, setClienteExpandido] = useState(false);
  const [chamadoExpandido, setChamadoExpandido] = useState(false);
  const [clienteDetalhe, setClienteDetalhe] = useState<ClienteDetalhe | null>(
    null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const carregar = useCallback(async () => {
    try {
      // Check for prefetched ticket data first
      const prefetchedTicket = detailsCache.getPrefetched(id);
      if (prefetchedTicket) {
        setTicket(prefetchedTicket);
        setLoading(false);
      }

      // Load ticket and messages with cache
      const [ticketData, mensagensData] = await Promise.all([
        detailsCache.fetchWithCache(
          `ticket_details_${id}`,
          async () => {
            const res = await fetch(`/api/tickets/${id}`);
            if (!res.ok) throw new Error('Ticket not found');
            return res.json();
          },
          180000 // 3min for ticket details
        ),
        detailsCache.fetchWithCache(
          `ticket_messages_${id}`,
          async () => {
            const res = await fetch(`/api/tickets/${id}/mensagens`);
            return res.ok ? res.json() : [];
          },
          60000 // 1min for messages (they change more frequently)
        )
      ]);

      setTicket(ticketData);
      setMensagens(mensagensData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading ticket:', error);
      router.push("/painel/tickets");
    }
  }, [id, router]);

  useEffect(() => {
    carregar();

    // Background cache warming for commonly needed data
    setTimeout(() => {
      // Pre-cache user profile if not already cached
      detailsCache.fetchWithCache(
        'user_profile',
        async () => {
          const res = await fetch("/api/auth/me");
          return res.ok ? res.json() : null;
        },
        600000
      ).catch(() => {});

      // Pre-cache status and priority options (frequently used in dropdowns)
      detailsCache.fetchWithCache(
        'ticket_status_options',
        async () => {
          const res = await fetch("/api/ticket-status");
          return res.ok ? res.json() : [];
        },
        600000
      ).catch(() => {});

      detailsCache.fetchWithCache(
        'ticket_priority_options',
        async () => {
          const res = await fetch("/api/ticket-prioridades");
          return res.ok ? res.json() : [];
        },
        600000
      ).catch(() => {});
    }, 1000); // Start warming after 1 second
  }, [carregar]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (mensagens.length > 0 && bottomRef.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [mensagens.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter to submit form
      if (e.ctrlKey && e.key === "Enter" && !enviando && resposta.replace(/<[^>]*>/g, "").trim()) {
        e.preventDefault();
        const event = new Event('submit', { bubbles: true, cancelable: true });
        formRef.current?.dispatchEvent(event);
      }
      // Escape to close modals
      if (e.key === "Escape") {
        if (editarAberto) setEditarAberto(false);
        if (transferirAberto) setTransferirAberto(false);
        if (finalizarAberto) setFinalizarAberto(false);
        if (cancelarAberto) setCancelarAberto(false);
        if (statusAberto) setStatusAberto(false);
        if (prioridadeAberta) setPrioridadeAberta(false);
        if (confirmarReaberturaAberto) setConfirmarReaberturaAberto(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enviando, resposta, editarAberto, transferirAberto, finalizarAberto, cancelarAberto, statusAberto, prioridadeAberta, confirmarReaberturaAberto]);

  useEffect(() => {
    if (!ticket?.cliente_id) return;

    detailsCache.fetchWithCache(
      `client_details_${ticket.cliente_id}`,
      async () => {
        const res = await fetch(`/api/clientes/${ticket.cliente_id}`);
        return res.ok ? res.json() : null;
      },
      300000 // 5min for client details
    ).then((d) => {
      if (d) {
        setClienteDetalhe({
          email: d.email,
          telefone: d.telefone,
          documento: d.documento,
          segmento: d.segmento,
        });
      }
    }).catch(() => {});
  }, [ticket?.cliente_id]);

  // Carrega perfil do usuário (essencial)
  useEffect(() => {
    detailsCache.fetchWithCache(
      'user_profile',
      async () => {
        const res = await fetch("/api/auth/me");
        return res.ok ? res.json() : null;
      },
      600000 // 10min for user profile
    ).then((data) => {
      if (data) setPerfilUsuario(data.perfil ?? null);
    }).catch(() => {});
  }, []);

  // Carrega opções sob demanda quando necessário
  const carregarOpcoesStatusPrioridade = useCallback(async () => {
    console.log('🔄 carregarOpcoesStatusPrioridade iniciada');
    console.log('📊 Status atual:', statusOpcoes.length, 'Prioridades:', prioridadeOpcoes.length);

    if (statusOpcoes.length > 0 && prioridadeOpcoes.length > 0) {
      console.log('✅ Já carregado, retornando status existentes...');
      return statusOpcoes;
    }

    const promises = [];
    let statusCarregados: any[] = statusOpcoes;

    if (statusOpcoes.length === 0) {
      console.log('🔄 Carregando status da API...');
      const statusPromise = detailsCache.fetchWithCache(
        'ticket_status_options',
        async () => {
          console.log('📡 Fazendo fetch para /api/ticket-status...');
          const res = await fetch("/api/ticket-status");
          console.log('📡 Resposta da API:', res.status, res.ok);

          if (res.ok) {
            const data = await res.json();
            console.log('✅ Dados recebidos:', data);
            return data;
          } else {
            console.error('❌ Erro na API:', res.status, await res.text());
            return [];
          }
        },
        600000 // 10min for status options
      ).then((data) => {
        console.log('💾 Setando statusOpcoes com:', data);
        setStatusOpcoes(data);
        statusCarregados = data;
        return data;
      });
      promises.push(statusPromise);
    }

    if (prioridadeOpcoes.length === 0) {
      console.log('🔄 Carregando prioridades da API...');
      promises.push(
        detailsCache.fetchWithCache(
          'ticket_priority_options',
          async () => {
            const res = await fetch("/api/ticket-prioridades");
            return res.ok ? res.json() : [];
          },
          600000 // 10min for priority options
        ).then(setPrioridadeOpcoes)
      );
    }

    console.log('⏳ Aguardando Promise.all com', promises.length, 'promises...');
    await Promise.all(promises);
    console.log('✅ Promise.all concluída!');
    console.log('📋 Retornando status carregados:', statusCarregados.length);
    return statusCarregados;
  }, [statusOpcoes.length, prioridadeOpcoes.length]);

  const carregarUsuariosEDepartamentos = useCallback(async () => {
    if (usuarios.length > 0 && departamentos.length > 0) return;

    const promises = [];

    if (usuarios.length === 0) {
      promises.push(
        detailsCache.fetchWithCache(
          'users_list',
          async () => {
            const res = await fetch("/api/usuarios?pageSize=100");
            if (!res.ok) return [];
            const data = await res.json();
            return (data.data ?? []).filter(
              (u: UsuarioOpcao) => u.perfil !== "cliente" && u.ativo !== false,
            );
          },
          300000 // 5min for users list
        ).then(setUsuarios)
      );
    }

    if (departamentos.length === 0) {
      promises.push(
        detailsCache.fetchWithCache(
          'departments_list',
          async () => {
            const res = await fetch("/api/departamentos?pageSize=100");
            if (!res.ok) return [];
            const data = await res.json();
            return data.data ?? [];
          },
          300000 // 5min for departments list
        ).then(setDepartamentos)
      );
    }

    await Promise.all(promises);
  }, [usuarios.length, departamentos.length]);

  const carregarCategorias = useCallback(async () => {
    if (categorias.length > 0) return;

    const categories = await detailsCache.fetchWithCache(
      'categories_list',
      async () => {
        const res = await fetch("/api/categorias?pageSize=100");
        if (!res.ok) return [];
        const data = await res.json();
        return data.data ?? [];
      },
      300000 // 5min for categories list
    );

    setCategorias(categories);
  }, [categorias.length]);

  // Carrega subcategorias ao mudar categoria no modal de edição
  useEffect(() => {
    if (!editarAberto || !editarCategoriaId) {
      setSubcategorias([]);
      return;
    }

    detailsCache.fetchWithCache(
      `subcategories_${editarCategoriaId}`,
      async () => {
        const res = await fetch(`/api/subcategorias?categoria_id=${editarCategoriaId}&pageSize=100`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.data ?? [];
      },
      300000 // 5min for subcategories
    ).then(setSubcategorias).catch(() => {});
  }, [editarAberto, editarCategoriaId]);

  function abrirModalEditar() {
    if (!ticket) return;
    // Carrega opções necessárias para edição
    carregarUsuariosEDepartamentos();
    carregarCategorias();
    carregarOpcoesStatusPrioridade();

    setEditarTitulo(ticket.titulo);
    setEditarDepartamentoId(ticket.departamento_id ?? "");
    setEditarCategoriaId(ticket.categoria_id ?? "");
    setEditarSubcategoriaId(ticket.subcategoria_id ?? "");
    setEditarPrioridadeId(ticket.prioridade_id);
    setEditarAtribuidoA(ticket.atribuido_a ?? "");
    setEditarDescricao(htmlToTexto(ticket.descricao ?? ""));
    setEditarAberto(true);
  }

  async function salvarEdicao() {
    if (!editarTitulo.trim()) return;
    setSalvandoEdicao(true);
    try {
      await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: editarTitulo.trim(),
          descricao: textoToHtml(editarDescricao.trim()),
          departamento_id: editarDepartamentoId || null,
          categoria_id: editarCategoriaId || null,
          subcategoria_id: editarSubcategoriaId || null,
          prioridade_id: editarPrioridadeId || null,
          atribuido_a: editarAtribuidoA || null,
          log_edicao: true,
        }),
      });
      setEditarAberto(false);
      await carregar();
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function enviarResposta(e: React.FormEvent) {
    e.preventDefault();
    const textoLimpo = resposta.replace(/<[^>]*>/g, "").trim();
    if (!textoLimpo || enviando) return; // Prevent double submission

    setEnviando(true);
    try {
      let res: Response;
      if (attachments.length > 0) {
        const fd = new FormData();
        fd.append("corpo", resposta);
        fd.append("interna", String(interna));
        for (const f of attachments) fd.append("arquivos", f);
        res = await fetch(`/api/tickets/${id}/mensagens`, {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(`/api/tickets/${id}/mensagens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corpo: resposta, interna }),
        });
      }

      if (res.ok) {
        // Clear form immediately for better UX
        setResposta("");
        setAttachments([]);
        editorRef.current?.clear();

        // If ticket is via WhatsApp and option is checked, also send via WhatsApp
        if (!interna && enviarViaWhatsapp && clienteDetalhe?.telefone) {
          fetch("/api/whatsapp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticket_id: id,
              numero: clienteDetalhe.telefone,
              mensagem: resposta,
            }),
          }).catch((err) => {
            console.warn("[WhatsApp send] error:", err);
          });
        }

        // Clear messages cache and reload
        detailsCache.clearCache(`ticket_messages_${id}`);
        await carregar();
      }
    } finally {
      setEnviando(false);
    }
  }

  // Auto-enable WhatsApp send when ticket comes from WhatsApp
  useEffect(() => {
    if (ticket?.canal === "whatsapp") setEnviarViaWhatsapp(true);
  }, [ticket?.canal]);


  async function transferirTicket() {
    setTransferindo(true);
    try {
      const body: Record<string, string | null> = {};
      if (transferirTipo === "atendente") {
        body.atribuido_a = transferirAtendente || null;
      } else {
        body.departamento_id = transferirDepartamento || null;
        body.atribuido_a = transferirAtendente || null;
      }
      await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setTransferirAberto(false);
      await carregar();
    } finally {
      setTransferindo(false);
    }
  }

  async function excluirTicket() {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir o chamado #${ticket?.numero}?\n\nEsta ação não pode ser desfeita.`,
      )
    )
      return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/painel/tickets");
      }
    } finally {
      setExcluindo(false);
    }
  }

  async function finalizarTicket() {
    const textoLimpo = finalizarMotivo.replace(/<[^>]*>/g, "").trim();
    if (!textoLimpo) return;
    setFinalizando(true);
    try {
      // Envia a mensagem de finalização
      const msgResponse = await fetch(`/api/tickets/${id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpo: finalizarMotivo, interna: false }),
      });
      if (!msgResponse.ok) {
        let errorMessage = `HTTP ${msgResponse.status} - ${msgResponse.statusText}`;
        try {
          const contentType = msgResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const msgError = await msgResponse.json();
            errorMessage = msgError.error || errorMessage;
          } else {
            const textResponse = await msgResponse.text();
            errorMessage += ` - ${textResponse.substring(0, 100)}`;
          }
        } catch (parseError) {
          errorMessage += ' (erro ao ler resposta)';
        }
        alert(`Erro ao enviar mensagem: ${errorMessage}`);
        return;
      }

      // Fecha o ticket com o status de encerramento e salva tempo de trabalho
      const statusEncerra = statusOpcoes.find((s) => s.encerra === true);
      if (statusEncerra) {
        const hh = parseInt(finalizarHH || "0", 10);
        const mm = parseInt(finalizarMM || "0", 10);
        const tempoMinutos = hh * 60 + mm;
        console.log('Enviando PATCH para finalizar:', { status_id: statusEncerra.id, ...(tempoMinutos > 0 && { tempo_trabalho_minutos: tempoMinutos }) });
        const statusResponse = await fetch(`/api/tickets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status_id: statusEncerra.id,
            ...(tempoMinutos > 0 && { tempo_trabalho_minutos: tempoMinutos }),
          }),
        });
        console.log('Resposta PATCH status:', statusResponse.status, statusResponse.statusText);
        if (!statusResponse.ok) {
          const contentType = statusResponse.headers.get('content-type');
          let errorMessage = `HTTP ${statusResponse.status} - ${statusResponse.statusText}`;

          if (contentType && contentType.includes('application/json')) {
            try {
              const statusError = await statusResponse.json();
              errorMessage = statusError.error || errorMessage;
            } catch {
              errorMessage += ' (resposta JSON inválida)';
            }
          } else {
            const textResponse = await statusResponse.text();
            errorMessage += ` - ${textResponse.substring(0, 100)}`;
          }

          alert(`Erro ao finalizar ticket: ${errorMessage}`);
          return;
        }

        // Sucesso - não precisa ler a resposta JSON
        console.log('✅ Ticket finalizado com sucesso!');
      } else {
        alert('Erro: não foi encontrado um status de encerramento configurado');
        return;
      }
      // Limpa o cache para forçar recarregamento dos dados atualizados
      detailsCache.clearCache(`ticket_details_${id}`);
      detailsCache.clearCache(`ticket_messages_${id}`);

      setFinalizarAberto(false);
      setFinalizarMotivo("");
      setFinalizarHH("");
      setFinalizarMM("");
      finalizarEditorRef.current?.clear();
      await carregar();
    } catch (error) {
      console.error('Erro ao finalizar ticket:', error);
      alert(`Erro ao finalizar ticket: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setFinalizando(false);
    }
  }

  async function cancelarTicket() {
    const textoLimpo = cancelarMotivo.replace(/<[^>]*>/g, "").trim();
    if (!textoLimpo) return;
    setCancelando(true);
    try {
      await fetch(`/api/tickets/${id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpo: cancelarMotivo, interna: false }),
      });
      const statusCancelado = statusOpcoes.find(
        (s) => s.codigo === "cancelado",
      );
      if (statusCancelado) {
        await fetch(`/api/tickets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status_id: statusCancelado.id }),
        });
      }
      setCancelarAberto(false);
      setCancelarMotivo("");
      cancelarEditorRef.current?.clear();
      await carregar();
    } finally {
      setCancelando(false);
    }
  }

  async function reabrirTicket() {
    setReabrindo(true);
    try {
      // Garante que as opções de status estejam carregadas
      const statusCarregados = await carregarOpcoesStatusPrioridade();

      // Usa os dados carregados diretamente ou fallback para o estado
      const statusParaUsar = statusCarregados && statusCarregados.length > 0 ? statusCarregados : statusOpcoes;

      const statusAberto =
        statusParaUsar.find((s) => s.encerra === false) ?? statusParaUsar[0];

      if (statusAberto) {
        const response = await fetch(`/api/tickets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status_id: statusAberto.id }),
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorMessage = `HTTP ${response.status} - ${response.statusText}`;

          if (contentType && contentType.includes('application/json')) {
            try {
              const error = await response.json();
              errorMessage = error.error || errorMessage;
            } catch {
              errorMessage += ' (resposta JSON inválida)';
            }
          } else {
            const textResponse = await response.text();
            errorMessage += ` - ${textResponse.substring(0, 100)}`;
          }

          alert(`Erro ao reabrir ticket: ${errorMessage}`);
          return;
        }

        // Limpa o cache para forçar recarregamento dos dados atualizados
        detailsCache.clearCache(`ticket_details_${id}`);
        detailsCache.clearCache(`ticket_messages_${id}`);
        await carregar();
      } else {
        alert('Erro: não foi encontrado um status aberto configurado');
      }
    } catch (error) {
      console.error('Erro ao reabrir ticket:', error);
      alert(`Erro ao reabrir ticket: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setReabrindo(false);
    }
  }

  async function atualizarStatus(statusId: string) {
    if (salvandoStatus) return; // Prevent double clicks
    setSalvandoStatus(true);
    try {
      await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: statusId }),
      });
      // Clear relevant caches
      detailsCache.clearCache(`ticket_details_${id}`);
      await carregar();
    } finally {
      setSalvandoStatus(false);
    }
  }

  async function atualizarPrioridade(prioridadeId: string) {
    if (salvandoStatus) return; // Reuse the same loading state
    setSalvandoStatus(true);
    try {
      await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prioridade_id: prioridadeId }),
      });
      // Clear relevant caches
      detailsCache.clearCache(`ticket_details_${id}`);
      await carregar();
    } finally {
      setSalvandoStatus(false);
    }
  }

  // Mapa de cores por autor (memoized)
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

  // Computações SLA (memoized for performance)
  const slaData = useMemo(() => {
    if (!ticket) {
      return {
        slaDeadline: null,
        slaPct: 0,
        slaDentroSla: null,
        slaEmAlerta: false,
        slaTotalHoras: 0,
        slaDecorridoHoras: 0,
        slaDecorridoMinutos: 0,
      };
    }

    const agora = new Date();
    const criadoEm = new Date(ticket.criado_em);
    const slaDeadline = ticket.sla_resolucao_deadline
      ? new Date(ticket.sla_resolucao_deadline)
      : null;
    const slaTotalMs = slaDeadline
      ? slaDeadline.getTime() - criadoEm.getTime()
      : null;
    const slaDecorridoMs = slaTotalMs
      ? Math.min(agora.getTime() - criadoEm.getTime(), slaTotalMs)
      : null;
    const slaPct =
      slaTotalMs && slaDecorridoMs
        ? Math.min(Math.round((slaDecorridoMs / slaTotalMs) * 100), 100)
        : 0;
    const slaDentroSla = slaDeadline ? agora < slaDeadline : null;
    const slaEmAlerta = slaTotalMs
      ? slaPct >= (ticket.sla_alerta_pct ?? 70)
      : false;
    const slaTotalHoras = slaTotalMs
      ? Math.round(slaTotalMs / (1000 * 60 * 60))
      : 0;
    const slaDecorridoHoras = slaDecorridoMs
      ? Math.floor(slaDecorridoMs / (1000 * 60 * 60))
      : 0;
    const slaDecorridoMinutos = slaDecorridoMs
      ? Math.floor((slaDecorridoMs % (1000 * 60 * 60)) / (1000 * 60))
      : 0;

    return {
      slaDeadline,
      slaPct,
      slaDentroSla,
      slaEmAlerta,
      slaTotalHoras,
      slaDecorridoHoras,
      slaDecorridoMinutos,
    };
  }, [ticket?.criado_em, ticket?.sla_resolucao_deadline, ticket?.sla_alerta_pct]);

  const { slaDeadline, slaPct, slaDentroSla, slaEmAlerta, slaTotalHoras, slaDecorridoHoras, slaDecorridoMinutos } = slaData;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <>
      {/* ═══ LAYOUT PRINCIPAL ═══ */}
      <div className="flex h-full overflow-hidden">
        {/* ── Coluna central ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Cabeçalho */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
            <Link
              href="/painel/tickets"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={14} />
              Tickets
            </Link>
            <span className="text-gray-200 select-none">|</span>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-gray-900 truncate">
                #{ticket.numero} — {ticket.titulo}
              </h1>
            </div>
            {/* Botões — estilos originais preservados */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <button
                type="button"
                onClick={abrirModalEditar}
                title="Editar chamado"
                className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-400 rounded-md px-2.5 py-1.5 transition-colors"
              >
                <Pencil size={13} />
                Editar
              </button>
              {ticket.status_encerra ? (
                <button
                  type="button"
                  onClick={() => setConfirmarReaberturaAberto(true)}
                  disabled={reabrindo}
                  title="Reabrir chamado"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-400 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reabrindo ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CornerUpLeft size={13} />
                  )}
                  Reabrir Chamado
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    carregarOpcoesStatusPrioridade();
                    setFinalizarAberto(true);
                  }}
                  title="Finalizar chamado"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-green-700 border border-green-300 bg-white hover:bg-green-50 hover:border-green-500 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <CheckCircle2 size={13} />
                  Finalizar
                </button>
              )}
              {!ticket.status_encerra && (
                <button
                  type="button"
                  onClick={() => setCancelarAberto(true)}
                  title="Cancelar chamado"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 border border-orange-200 bg-white hover:bg-orange-50 hover:border-orange-400 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <X size={13} />
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  carregarUsuariosEDepartamentos();
                  setTransferirTipo("atendente");
                  setTransferirAtendente(ticket.atribuido_a ?? "");
                  setTransferirDepartamento(ticket.departamento_id ?? "");
                  setTransferirAberto(true);
                }}
                disabled={ticket.status_encerra}
                title={
                  ticket.status_encerra
                    ? "Não é possível transferir um chamado finalizado"
                    : "Transferir chamado"
                }
                className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 border border-purple-200 bg-white hover:bg-purple-50 hover:border-purple-400 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRightLeft size={13} />
                Transferir
              </button>
              {perfilUsuario === "admin" && (
                <button
                  type="button"
                  onClick={excluirTicket}
                  disabled={excluindo || ticket.status_encerra}
                  title={
                    ticket.status_encerra
                      ? "Não é possível excluir um chamado finalizado"
                      : "Excluir chamado"
                  }
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 bg-white hover:bg-red-50 hover:border-red-400 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {excluindo ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                  Excluir
                </button>
              )}
            </div>
          </div>

          {/* ── Mensagens (área scrollável) ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-1 max-w-3xl">
              {[...mensagens].reverse().map((m) => {
                const isOperador = m.autor_perfil !== "cliente";
                const isSistema = m.autor_perfil === "sistema";
                const inicial = m.autor_nome?.charAt(0).toUpperCase() ?? "?";
                const avatarColor = autorColorMap[m.autor_id] ?? "#9ca3af";

                if (isSistema) {
                  return (
                    <div key={m.id} className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-px bg-gray-100" />
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                        <span dangerouslySetInnerHTML={{ __html: m.corpo }} />
                        {" · "}
                        <ClientDate
                          date={m.criado_em}
                          formatString="HH:mm"
                        />
                      </span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                  );
                }

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
                          <ClientDate
                            date={m.criado_em}
                            formatString="dd/MM/yyyy 'às' HH:mm"
                          />
                          {isOperador && " · Atendente"}
                        </span>
                        {m.interna && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                            <Lock size={9} /> Nota interna
                          </span>
                        )}
                      </div>
                      <div
                        className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                          m.interna
                            ? "bg-amber-50 border border-amber-200"
                            : isOperador
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
                              {a.tamanho && (
                                <span className="text-gray-400 flex-shrink-0">
                                  (
                                  {a.tamanho < 1024
                                    ? `${a.tamanho} B`
                                    : a.tamanho < 1024 * 1024
                                      ? `${Math.round(a.tamanho / 1024)} KB`
                                      : `${(a.tamanho / (1024 * 1024)).toFixed(1)} MB`}
                                  )
                                </span>
                              )}
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
          <div className="flex-shrink-0 border-t border-gray-200 bg-white">
            <div className="flex border-b border-gray-100 px-1">
              <button
                type="button"
                onClick={() => setInterna(false)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  !interna
                    ? "border-gray-800 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                Responder
              </button>
              <button
                type="button"
                onClick={() => setInterna(true)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  interna
                    ? "border-amber-500 text-amber-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Lock size={11} className="inline mr-1 opacity-70" />
                Nota interna
              </button>
            </div>
            <form
              ref={formRef}
              onSubmit={enviarResposta}
              className={interna ? "bg-amber-50" : "bg-white"}
            >
              <div className="px-4 pt-3 pb-2">
                <RichTextEditor
                  ref={editorRef}
                  value={resposta}
                  onChange={setResposta}
                  onAttach={setAttachments}
                  placeholder={
                    interna
                      ? "Nota interna (não visível ao cliente)..."
                      : "Escreva a resposta para o cliente..."
                  }
                  disabled={enviando}
                />
              </div>
              {ticket.canal === "whatsapp" && !interna && (
                <div className="px-4 pb-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={enviarViaWhatsapp}
                        onChange={(e) => setEnviarViaWhatsapp(e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-green-500" />
                    </div>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Smartphone className="w-3 h-3 text-green-600" />
                      Enviar também via WhatsApp
                      {!clienteDetalhe?.telefone && (
                        <span className="text-amber-500">
                          (sem telefone cadastrado)
                        </span>
                      )}
                    </span>
                  </label>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
                <p className="text-xs text-gray-400">Ctrl+Enter para enviar</p>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    enviando || !resposta.replace(/<[^>]*>/g, "").trim()
                  }
                >
                  {enviando ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {interna ? "Adicionar nota" : "Enviar"}
                </Button>
              </div>
            </form>
          </div>
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
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Cliente</p>
                {ticket.cliente_id ? (
                  <Link
                    href={`/painel/clientes/${ticket.cliente_id}`}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    onMouseEnter={() => {
                      // Prefetch dados do cliente no hover
                      if (ticket.cliente_id) {
                        fetch(`/api/clientes/${ticket.cliente_id}`, { priority: 'high' as any }).catch(() => {});
                      }
                    }}
                  >
                    {ticket.cliente_nome ?? "—"}
                  </Link>
                ) : (
                  <p className="text-sm text-gray-800">
                    {ticket.cliente_nome ?? "—"}
                  </p>
                )}
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
              {ticket.subcategoria_nome && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">
                    Subcategoria
                  </p>
                  <p className="text-sm text-gray-800">
                    {ticket.subcategoria_nome}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Atendente</p>
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
                <button
                  type="button"
                  onClick={() => {
                    carregarOpcoesStatusPrioridade();
                    setStatusAberto(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity"
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
                </button>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Prioridade</p>
                <button
                  type="button"
                  onClick={() => {
                    carregarOpcoesStatusPrioridade();
                    setPrioridadeAberta(true);
                  }}
                  className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    color: ticket.prioridade_cor,
                    borderColor: ticket.prioridade_cor + "55",
                    backgroundColor: ticket.prioridade_cor + "15",
                  }}
                >
                  {ticket.prioridade_nome}
                </button>
              </div>
            </div>
          </div>

          {/* SLA */}
          {slaDeadline && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
                SLA
              </p>
              <p className="text-[11px] text-gray-500 mb-1">
                Prazo de resposta
              </p>
              <p
                className={`text-sm font-medium mb-3 ${slaDentroSla ? (slaEmAlerta ? "text-yellow-600" : "text-green-600") : "text-red-500"}`}
              >
                {slaDentroSla
                  ? slaEmAlerta
                    ? "⚠ Atenção — prazo próximo"
                    : "✓ Dentro do prazo"
                  : "✗ Fora do prazo"}
              </p>
              <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                <span>
                  {slaDecorridoHoras}h {slaDecorridoMinutos}min
                </span>
                <span>{slaTotalHoras}h limite</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all ${slaDentroSla ? (slaEmAlerta ? "bg-yellow-400" : "bg-green-500") : "bg-red-500"}`}
                  style={{ width: `${slaPct}%` }}
                />
              </div>
              <div className="mt-3.5">
                <p className="text-[11px] text-gray-400 mb-0.5">Aberto em</p>
                <p className="text-sm text-gray-800">
                  <ClientDate
                    date={ticket.criado_em}
                    formatString="dd/MM/yyyy 'às' HH:mm"
                    fallback="Carregando..."
                  />
                </p>
              </div>
            </div>
          )}

          {/* HISTÓRICO */}
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Histórico
            </p>
            <div className="space-y-3">
              {ticket.atribuido_nome && (
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 mt-1 flex-shrink-0" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Ticket atribuído a{" "}
                    <span className="font-medium">{ticket.atribuido_nome}</span>
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-green-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Ticket aberto por{" "}
                    <span className="font-medium">
                      {ticket.aberto_por_nome}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    <ClientDate
                      date={ticket.criado_em}
                      formatString="HH:mm"
                    />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ═══ DIALOGS ═══ */}

      {/* Modal Transferir */}
      <Dialog open={transferirAberto} onOpenChange={setTransferirAberto}>
        <DialogContent showCloseButton={false} className="max-w-lg p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900 truncate pr-4">
              Transferir Chamado: #{ticket.numero} - {ticket.titulo}
            </DialogTitle>
            <button
              type="button"
              onClick={() => setTransferirAberto(false)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 w-28">
                Transferir para:
              </span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="transferirTipo"
                    value="atendente"
                    checked={transferirTipo === "atendente"}
                    onChange={() => setTransferirTipo("atendente")}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">Atendente</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="transferirTipo"
                    value="departamento"
                    checked={transferirTipo === "departamento"}
                    onChange={() => setTransferirTipo("departamento")}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">Departamento</span>
                </label>
              </div>
            </div>
            {transferirTipo === "departamento" && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 w-28">
                  Departamento:
                </span>
                <select
                  value={transferirDepartamento}
                  onChange={(e) => setTransferirDepartamento(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Selecione um departamento</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 w-28">
                Atendente:
              </span>
              <select
                value={transferirAtendente}
                onChange={(e) => setTransferirAtendente(e.target.value)}
                className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Selecione um atendente</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <button
              type="button"
              onClick={transferirTicket}
              disabled={
                transferindo ||
                (transferirTipo === "departamento" && !transferirDepartamento)
              }
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {transferindo && <Loader2 size={14} className="animate-spin" />}
              Transferir
            </button>
            <button
              type="button"
              onClick={() => setTransferirAberto(false)}
              className="inline-flex items-center text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-4 py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Finalizar */}
      <Dialog open={finalizarAberto} onOpenChange={setFinalizarAberto}>
        <DialogContent showCloseButton={false} className="max-w-lg p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Finalizar Chamado
            </DialogTitle>
            <button
              type="button"
              onClick={() => setFinalizarAberto(false)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={16} />
            </button>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Motivo:</p>
              <RichTextEditor
                ref={finalizarEditorRef}
                value={finalizarMotivo}
                onChange={setFinalizarMotivo}
                placeholder="Insira aqui a resposta do seu chamado"
                disabled={finalizando}
              />
            </div>
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              Exibir respostas padrões
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Tempo de trabalho:
              </span>
              <input
                type="number"
                min={0}
                max={99}
                placeholder="HH"
                value={finalizarHH}
                onChange={(e) => setFinalizarHH(e.target.value)}
                className="w-20 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 text-center text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                min={0}
                max={59}
                placeholder="MM"
                value={finalizarMM}
                onChange={(e) => setFinalizarMM(e.target.value)}
                className="w-20 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 text-center text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <button
              type="button"
              title="Anexar arquivo"
              className="p-2 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <Paperclip size={15} />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={finalizarTicket}
                disabled={
                  finalizando || !finalizarMotivo.replace(/<[^>]*>/g, "").trim()
                }
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {finalizando && <Loader2 size={14} className="animate-spin" />}
                Finalizar
              </button>
              <button
                type="button"
                onClick={() => setFinalizarAberto(false)}
                className="inline-flex items-center text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-4 py-2 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Cancelar */}
      <Dialog open={cancelarAberto} onOpenChange={setCancelarAberto}>
        <DialogContent showCloseButton={false} className="max-w-lg p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Cancelar Chamado
            </DialogTitle>
            <button
              type="button"
              onClick={() => setCancelarAberto(false)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={16} />
            </button>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Motivo do cancelamento:
              </p>
              <RichTextEditor
                ref={cancelarEditorRef}
                value={cancelarMotivo}
                onChange={setCancelarMotivo}
                placeholder="Descreva o motivo do cancelamento..."
                disabled={cancelando}
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelarTicket}
                disabled={
                  cancelando || !cancelarMotivo.replace(/<[^>]*>/g, "").trim()
                }
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelando && <Loader2 size={14} className="animate-spin" />}
                Cancelar Chamado
              </button>
              <button
                type="button"
                onClick={() => setCancelarAberto(false)}
                className="inline-flex items-center text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-4 py-2 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal — Alterar Status */}
      <Dialog open={statusAberto} onOpenChange={setStatusAberto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Status</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            {statusOpcoes
              .filter((s) => !['finalizado', 'cancelado'].includes(s.codigo))
              .map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={salvandoStatus}
                onClick={async () => {
                  await atualizarStatus(s.id);
                  setStatusAberto(false);
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
                style={{
                  borderColor:
                    s.id === ticket.status_id ? s.cor + "88" : undefined,
                  backgroundColor:
                    s.id === ticket.status_id ? s.cor + "12" : undefined,
                  color: s.id === ticket.status_id ? s.cor : undefined,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.cor }}
                />
                {s.nome}
                {s.id === ticket.status_id && (
                  <span className="ml-auto text-[11px] opacity-60">atual</span>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal — Editar Chamado */}
      <Dialog open={editarAberto} onOpenChange={setEditarAberto}>
        <DialogContent showCloseButton={false} className="max-w-lg p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900 truncate pr-4">
              Editar Chamado: #{ticket.numero}
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
              />
            </div>
            {/* Descrição */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição
              </label>
              <textarea
                value={editarDescricao}
                onChange={(e) => setEditarDescricao(e.target.value)}
                rows={5}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            {/* Departamento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Departamento
              </label>
              <select
                value={editarDepartamentoId}
                onChange={(e) => setEditarDepartamentoId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Sem departamento</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            {/* Categoria */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoria
              </label>
              <select
                value={editarCategoriaId}
                onChange={(e) => {
                  setEditarCategoriaId(e.target.value);
                  setEditarSubcategoriaId("");
                }}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            {/* Subcategoria */}
            {subcategorias.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subcategoria
                </label>
                <select
                  value={editarSubcategoriaId}
                  onChange={(e) => setEditarSubcategoriaId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Sem subcategoria</option>
                  {subcategorias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                <option value="">Sem prioridade</option>
                {prioridadeOpcoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            {/* Atendente */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Atendente
              </label>
              <select
                value={editarAtribuidoA}
                onChange={(e) => setEditarAtribuidoA(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Não atribuído</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
            <button
              type="button"
              onClick={salvarEdicao}
              disabled={salvandoEdicao || !editarTitulo.trim()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvandoEdicao && <Loader2 size={14} className="animate-spin" />}
              Salvar alterações
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

      {/* Modal — Alterar Prioridade */}
      <Dialog open={prioridadeAberta} onOpenChange={setPrioridadeAberta}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Prioridade</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            {prioridadeOpcoes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={async () => {
                  await atualizarPrioridade(p.id);
                  setPrioridadeAberta(false);
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{
                  borderColor:
                    p.id === ticket.prioridade_id ? p.cor + "88" : undefined,
                  backgroundColor:
                    p.id === ticket.prioridade_id ? p.cor + "12" : undefined,
                  color: p.id === ticket.prioridade_id ? p.cor : undefined,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.cor }}
                />
                {p.nome}
                {p.id === ticket.prioridade_id && (
                  <span className="ml-auto text-[11px] opacity-60">atual</span>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmação Reabertura */}
      <Dialog open={confirmarReaberturaAberto} onOpenChange={setConfirmarReaberturaAberto}>
        <DialogContent showCloseButton={false} className="max-w-md p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Reabrir Chamado
            </DialogTitle>
            <button
              type="button"
              onClick={() => setConfirmarReaberturaAberto(false)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={16} />
            </button>
          </DialogHeader>
          <div className="px-5 py-4">
            <p className="text-sm text-gray-700 mb-4">
              Tem certeza que deseja reabrir este chamado?
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-800">
                <strong>#{ticket?.numero}</strong> - {ticket?.titulo}
              </p>
            </div>
            <p className="text-xs text-gray-500">
              O chamado voltará para um status aberto e poderá receber novas interações.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setConfirmarReaberturaAberto(false)}
              className="inline-flex items-center text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-4 py-2 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmarReaberturaAberto(false);
                reabrirTicket();
              }}
              disabled={reabrindo}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reabrindo ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CornerUpLeft size={14} />
              )}
              Reabrir Chamado
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
