"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  Loader2,
  Plus,
  Ticket,
  ChevronRight,
  X,
  Send,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  RichTextEditor,
  type RichTextEditorRef,
} from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";

interface TicketRow {
  id: string;
  numero: string;
  titulo: string;
  canal: string;
  status_nome: string;
  status_cor: string;
  prioridade_nome: string;
  prioridade_cor: string;
  cliente_nome: string | null;
  atribuido_nome: string | null;
  departamento_nome: string | null;
  categoria_nome: string | null;
  criado_em: string;
  atualizado_em: string;
  sla_primeira_resp_deadline: string | null;
  sla_resolucao_deadline: string | null;
  respondido_em: string | null;
  sla_primeira_resp_ok: boolean | null;
  fechado_em: string | null;
  tempo_trabalho_minutos: number | null;
  sla_alerta_pct: number;
}

function tempoAberto(criadoEm: string): string {
  const mins = Math.floor((Date.now() - new Date(criadoEm).getTime()) / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h${mins % 60 > 0 ? ` ${mins % 60}min` : ""}`;
  const dias = Math.floor(hrs / 24);
  return `${dias}d ${hrs % 24}h`;
}

function tempoGasto(mins: number): string {
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h${mins % 60 > 0 ? ` ${mins % 60}min` : ""}`;
  const dias = Math.floor(hrs / 24);
  return `${dias}d ${hrs % 24}h`;
}

type SlaStatus = "ok" | "warning" | "exceeded" | "none";

// Constantes de estilo para SLA — declaradas fora do componente para evitar
// recriação de objetos a cada render
const SLA_COLORS: Record<SlaStatus, string> = {
  ok: "#15803D",
  warning: "#EAB308",
  exceeded: "#EF4444",
  none: "var(--color-text-muted)",
};
const SLA_LABELS: Record<SlaStatus, string> = {
  ok: "SLA OK",
  warning: "SLA próximo",
  exceeded: "SLA excedido",
  none: "",
};
const SLA_BG: Record<SlaStatus, string> = {
  ok: "#DCFCE7",
  warning: "#FEF9C3",
  exceeded: "#FEE2E2",
  none: "transparent",
};

// Cache para otimizar cálculos custosos
const slaCache = new Map<string, { status: SlaStatus; timestamp: number }>();
const dateFormatCache = new Map<string, string>();
const tempoAbertoCache = new Map<string, { valor: string; timestamp: number }>();
const tempoRelativoCache = new Map<string, { valor: string; timestamp: number }>();

function formatarDataMemoizada(data: string): string {
  if (!dateFormatCache.has(data)) {
    dateFormatCache.set(data, format(new Date(data), "dd/MM/yyyy HH:mm", { locale: ptBR }));
  }
  return dateFormatCache.get(data)!;
}

function tempoAbertoMemoizado(criadoEm: string): string {
  const agora = Date.now();
  const cached = tempoAbertoCache.get(criadoEm);

  // Cache válido por 30 segundos
  if (cached && agora - cached.timestamp < 30000) {
    return cached.valor;
  }

  const valor = tempoAberto(criadoEm);
  tempoAbertoCache.set(criadoEm, { valor, timestamp: agora });
  return valor;
}

// Memoizar slaTempoBadge para evitar recálculos
function slaTempoBadgeMemoizado(t: TicketRow, sla: SlaStatus): string {
  const cacheKey = `${t.id}_${t.sla_primeira_resp_deadline}_${sla}_${t.criado_em}`;
  const agora = Date.now();
  const cached = tempoRelativoCache.get(cacheKey);

  if (cached && agora - cached.timestamp < 30000) {
    return cached.valor;
  }

  const valor = slaTempoBadge(t, sla);
  tempoRelativoCache.set(cacheKey, { valor, timestamp: agora });
  return valor;
}

function slaAtendimento(t: TicketRow): SlaStatus {
  if (!t.sla_primeira_resp_deadline) return "none";
  if (t.respondido_em !== null) {
    return t.sla_primeira_resp_ok ? "ok" : "exceeded";
  }

  // Cache baseado em ID + deadline + timestamp atualizado
  const cacheKey = `${t.id}_${t.sla_primeira_resp_deadline}_${t.atualizado_em}`;
  const agora = Date.now();
  const cached = slaCache.get(cacheKey);

  // Cache válido por 30 segundos
  if (cached && agora - cached.timestamp < 30000) {
    return cached.status;
  }

  const deadline = new Date(t.sla_primeira_resp_deadline).getTime();
  const now = Date.now();
  let status: SlaStatus;

  if (now > deadline) {
    status = "exceeded";
  } else {
    const alerta = t.sla_alerta_pct ?? 70;
    const criado = new Date(t.criado_em).getTime();
    const total = deadline - criado;
    status = now > criado + (total * alerta) / 100 ? "warning" : "ok";
  }

  slaCache.set(cacheKey, { status, timestamp: agora });
  return status;
}

function slaTempoBadge(t: TicketRow, sla: SlaStatus): string {
  if (
    sla === "none" ||
    !t.sla_primeira_resp_deadline ||
    t.respondido_em !== null
  )
    return tempoAberto(t.criado_em);
  const deadline = new Date(t.sla_primeira_resp_deadline).getTime();
  const now = Date.now();
  if (sla === "exceeded") {
    const over = Math.floor((now - deadline) / 60000);
    return `há ${tempoGasto(over)}`;
  }
  const remaining = Math.floor((deadline - now) / 60000);
  return `${tempoGasto(remaining)} restante`;
}

interface Prioridade {
  id: string;
  nome: string;
  cor: string;
}
interface ClienteOpcao {
  id: string;
  nome_razao: string;
  documento?: string | null;
}
interface Departamento {
  id: string;
  nome: string;
}
interface Categoria {
  id: string;
  nome: string;
}
interface Subcategoria {
  id: string;
  nome: string;
}
interface Usuario {
  id: string;
  nome: string;
  perfil: string;
}
interface SessaoInfo {
  perfil: string;
  nome: string;
  sub: string;
}

const formVazio: {
  titulo: string;
  mensagem: string;
  prioridade_id: string | null;
  cliente_id: string | null;
  categoria_id: string | null;
  subcategoria_id: string | null;
  departamento_id: string | null;
  atribuido_a: string | null;
  notif_operador: boolean;
  notif_cliente: boolean;
} = {
  titulo: "",
  mensagem: "",
  prioridade_id: null,
  cliente_id: null,
  categoria_id: null,
  subcategoria_id: null,
  departamento_id: null,
  atribuido_a: null,
  notif_operador: true,
  notif_cliente: true,
};

interface TicketsClientProps {
  statusCodigo?: string;
}

// Componente memoizado para linha da tabela
const TicketTableRow = React.memo(function TicketTableRow({
  ticket,
  onClick,
}: {
  ticket: TicketRow & {
    dataFormatada: string;
    slaStatus: SlaStatus;
    tempoAbertoTexto: string;
    slaBadgeTexto: string;
  };
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className="tickets-table-row"
      style={{ borderBottom: "0.5px solid var(--color-border)" }}
    >
      {/* Protocolo */}
      <td className="whitespace-nowrap" style={{ padding: "10px 16px" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-brand)",
            letterSpacing: "0.02em",
          }}
        >
          #{ticket.numero}
        </span>
      </td>
      {/* Assunto */}
      <td style={{ padding: "10px 16px", maxWidth: 260 }}>
        <p
          className="truncate"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-primary)",
          }}
        >
          {ticket.titulo}
        </p>
        <div className="flex items-center gap-1.5" style={{ marginTop: 2 }}>
          <span
            className="capitalize"
            style={{
              fontSize: 10,
              color: "var(--color-text-muted)",
            }}
          >
            {ticket.canal}
          </span>
        </div>
      </td>
      {/* Departamento */}
      <td style={{ padding: "10px 16px", maxWidth: 180 }}>
        <span
          className="truncate block"
          style={{
            fontSize: 11,
            color: "var(--color-text-secondary)",
          }}
          title={ticket.departamento_nome ?? ""}
        >
          {ticket.departamento_nome ?? (
            <span style={{ color: "var(--color-border-hover)" }}>—</span>
          )}
        </span>
      </td>
      {/* Cliente */}
      <td style={{ padding: "10px 16px", maxWidth: 140 }}>
        <span
          className="truncate block"
          style={{
            fontSize: 11,
            color: "var(--color-text-secondary)",
          }}
          title={ticket.cliente_nome ?? ""}
        >
          {ticket.cliente_nome ?? (
            <span style={{ color: "var(--color-border-hover)" }}>—</span>
          )}
        </span>
      </td>
      {/* Categoria */}
      <td style={{ padding: "10px 16px", maxWidth: 140 }}>
        <span
          className="truncate block"
          style={{
            fontSize: 11,
            color: "var(--color-text-secondary)",
          }}
          title={ticket.categoria_nome ?? ""}
        >
          {ticket.categoria_nome ?? (
            <span style={{ color: "var(--color-border-hover)" }}>—</span>
          )}
        </span>
      </td>
      {/* Data/Hora */}
      <td className="whitespace-nowrap" style={{ padding: "10px 16px" }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
          }}
        >
          {ticket.dataFormatada}
        </span>
      </td>
      {/* Prioridade */}
      <td className="whitespace-nowrap" style={{ padding: "10px 16px" }}>
        <span
          className="inline-flex items-center"
          style={{
            padding: "2px 8px",
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 600,
            backgroundColor: ticket.prioridade_cor + "20",
            color: ticket.prioridade_cor,
          }}
        >
          {ticket.prioridade_nome}
        </span>
      </td>
      {/* Situação */}
      <td className="whitespace-nowrap" style={{ padding: "10px 16px" }}>
        <span
          className="inline-flex items-center gap-1"
          style={{
            padding: "2px 8px",
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 600,
            backgroundColor: ticket.status_cor + "20",
            color: ticket.status_cor,
          }}
        >
          <span
            className="rounded-full flex-shrink-0"
            style={{
              width: 6,
              height: 6,
              backgroundColor: ticket.status_cor,
              display: "inline-block",
            }}
          />
          {ticket.status_nome}
        </span>
      </td>
      {/* Tempo / SLA */}
      <td className="whitespace-nowrap" style={{ padding: "10px 16px" }}>
        {ticket.fechado_em && ticket.tempo_trabalho_minutos != null ? (
          <div className="flex flex-col gap-0.5">
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: "var(--color-text-muted)",
              }}
            >
              Tempo gasto
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--color-text-secondary)",
              }}
            >
              {tempoGasto(ticket.tempo_trabalho_minutos)}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {ticket.slaStatus !== "none" && (
              <span
                className="flex items-center gap-1"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: SLA_COLORS[ticket.slaStatus],
                  backgroundColor: SLA_BG[ticket.slaStatus],
                  padding: "1px 6px",
                  borderRadius: 12,
                  display: "inline-flex",
                }}
                title={
                  ticket.sla_primeira_resp_deadline
                    ? `Prazo: ${format(new Date(ticket.sla_primeira_resp_deadline), "dd/MM HH:mm", { locale: ptBR })}`
                    : ""
                }
              >
                {SLA_LABELS[ticket.slaStatus]}
              </span>
            )}
            <span
              style={{
                fontSize: 11,
                color: "var(--color-text-secondary)",
              }}
            >
              {ticket.slaBadgeTexto}
            </span>
          </div>
        )}
      </td>
      {/* Atendente */}
      <td style={{ padding: "10px 16px", maxWidth: 140 }}>
        <span
          className="truncate block"
          style={{
            fontSize: 11,
            color: "var(--color-text-secondary)",
          }}
          title={ticket.atribuido_nome ?? ""}
        >
          {ticket.atribuido_nome ?? (
            <span style={{ color: "var(--color-border-hover)" }}>—</span>
          )}
        </span>
      </td>
    </tr>
  );
});

export const TicketsClient = React.memo(function TicketsClient({ statusCodigo }: TicketsClientProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meus = searchParams.get("meus") === "1";
  const fila = searchParams.get("fila") === "1";
  const novo = searchParams.get("novo") === "1";
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [primeiroCarregamento, setPrimeiroCarregamento] = useState(true);
  const [busca, setBusca] = useState("");
  const [situacaoMeus, setSituacaoMeus] = useState("aberto");
  const [loading, setLoading] = useState(true);
  const primeiroRender = useRef(true);
  const loadingRef = useRef(false); // Ref para evitar race conditions

  const [painelAberto, setPainelAberto] = useState(novo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio);
  const editorRef = useRef<RichTextEditorRef>(null);

  // Sessão do usuário logado
  const [sessao, setSessao] = useState<SessaoInfo | null>(null);

  // Opções de lookup
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [carregandoCats, setCarregandoCats] = useState(false);
  const [carregandoSubs, setCarregandoSubs] = useState(false);
  const [atendentes, setAtendentes] = useState<Usuario[]>([]);

  // Modal solicitante (usuário com perfil=cliente)
  const [solicitanteModalAberto, setSolicitanteModalAberto] = useState(false);
  const [solicitanteBusca, setSolicitanteBusca] = useState("");
  const [solicitanteNomeSelecionado, setSolicitanteNomeSelecionado] =
    useState("");
  const [solicitanteResultados, setSolicitanteResultados] = useState<Usuario[]>(
    [],
  );
  const [buscandoSolicitante, setBuscandoSolicitante] = useState(false);
  const [solicitanteId, setSolicitanteId] = useState<string | null>(null);
  // Clientes vinculados ao solicitante selecionado (null = sem filtro)
  const [solicitanteClientes, setSolicitanteClientes] = useState<
    ClienteOpcao[] | null
  >(null);

  // Busca de cliente
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteNomeSelecionado, setClienteNomeSelecionado] = useState("");
  const [clienteResultados, setClienteResultados] = useState<ClienteOpcao[]>(
    [],
  );
  const [clienteDropdownAberto, setClienteDropdownAberto] = useState(false);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const clienteRef = useRef<HTMLDivElement>(null);
  const solicitanteRef = useRef<HTMLDivElement>(null);

  // Click-outside para solicitante
  const fecharSolicitante = useCallback(
    () => setSolicitanteModalAberto(false),
    [],
  );
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        solicitanteRef.current &&
        !solicitanteRef.current.contains(e.target as Node)
      ) {
        fecharSolicitante();
      }
    }
    if (solicitanteModalAberto)
      document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [solicitanteModalAberto, fecharSolicitante]);

  // Combobox atendente
  const [atendenteBusca, setAtendenteBusca] = useState("");
  const [atendenteAberto, setAtendenteAberto] = useState(false);
  const atendentesFiltrados = useMemo(
    () =>
      atendenteBusca
        ? atendentes.filter((u) =>
            u.nome.toLowerCase().includes(atendenteBusca.toLowerCase()),
          )
        : atendentes,
    [atendentes, atendenteBusca],
  );

  // Memoizar dados processados para otimizar renderização
  const ticketsOtimizados = useMemo(() => {
    return tickets.map((ticket) => {
      const slaStatus = slaAtendimento(ticket);
      return {
        ...ticket,
        dataFormatada: formatarDataMemoizada(ticket.atualizado_em),
        slaStatus,
        tempoAbertoTexto: tempoAbertoMemoizado(ticket.criado_em),
        slaBadgeTexto: slaTempoBadgeMemoizado(ticket, slaStatus),
      };
    });
  }, [tickets]);
  const atendenteRef = useRef<HTMLDivElement>(null);
  const fecharAtendente = useCallback(() => setAtendenteAberto(false), []);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        atendenteRef.current &&
        !atendenteRef.current.contains(e.target as Node)
      ) {
        fecharAtendente();
      }
    }
    if (atendenteAberto) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [atendenteAberto, fecharAtendente]);

  // Carregar tickets
  const carregar = useCallback(async () => {
    // Evitar loading desnecessário se já está carregando
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    let isMounted = true; // Flag para verificar se componente ainda está montado

    try {
      const params = new URLSearchParams({ q: busca, pageSize: "50" });
      if (statusCodigo) params.set("status_codigo", statusCodigo);
      if (meus) {
        params.set("meus", "1");
        if (situacaoMeus) params.set("status_codigo", situacaoMeus);
      }
      if (fila) params.set("fila", "1");
      const res = await fetch(`/api/tickets?${params}`);

      // Só processa se o componente ainda estiver montado
      if (!isMounted) return;

      const data = await res.json();
      setTickets(data.data ?? []);
      setTotal(data.total ?? 0);
      if (primeiroCarregamento) {
        setPrimeiroCarregamento(false);
      }
    } catch (error) {
      console.error('[Tickets] Erro ao carregar tickets:', error);
    } finally {
      if (isMounted) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  }, [busca, statusCodigo, meus, fila, situacaoMeus, primeiroCarregamento]);

  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false;
      // Carregamento inicial imediato sem delay
      carregar();
      return () => {
        if (carregar.cleanup) {
          carregar.cleanup();
        }
      };
    }
    // Para mudanças subsequentes (busca, filtros), usar debounce
    const t = setTimeout(carregar, 300);
    return () => {
      clearTimeout(t);
      if (carregar.cleanup) {
        carregar.cleanup();
      }
    };
  }, [busca, statusCodigo, meus, fila, situacaoMeus]); // Dependências diretas ao invés de carregar

  // Carregar sessão e opções fixas
  useEffect(() => {
    let isMounted = true;

    async function carregarOpcoes() {
      try {
        const [resMe, resP, resDep, resU] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/ticket-prioridades"),
          fetch("/api/departamentos?pageSize=100"),
          fetch("/api/usuarios?pageSize=100"),
        ]);

        if (!isMounted) return;

        if (resMe.ok) setSessao(await resMe.json());
        if (resP.ok) setPrioridades(await resP.json());
        if (resDep.ok) {
          const d = await resDep.json();
          setDepartamentos(d.data ?? d);
        }
        if (resU.ok) {
          const d = await resU.json();
          const lista: Usuario[] = d.data ?? d;
          setAtendentes(lista.filter((u: Usuario) => u.perfil !== "cliente"));
        }
      } catch (error) {
        console.error('[Tickets] Erro ao carregar opções:', error);
      }
    }

    carregarOpcoes();

    return () => {
      isMounted = false;
    };
  }, []);

  // Cleanup geral quando componente for desmontado
  useEffect(() => {
    return () => {
      // Reset todos os states para valores iniciais e limpar timers
      setLoading(false);
      setTickets([]);
      setTotal(0);
      setSessao(null);
      setPrioridades([]);
      setDepartamentos([]);
      setAtendentes([]);
      setCategorias([]);
      setSubcategorias([]);
      setBuscandoSolicitante(false);
      setCarregandoCats(false);
      setCarregandoSubs(false);
      setSalvando(false);
      setBuscandoCliente(false);
      setSolicitanteModalAberto(false);
      setAtendenteAberto(false);
      setClienteDropdownAberto(false);
      loadingRef.current = false;
      primeiroRender.current = true;
    };
  }, []);

  // Cascata departamento → categorias
  useEffect(() => {
    if (!form.departamento_id) {
      setCategorias([]);
      setSubcategorias([]);
      setForm((f) => ({ ...f, categoria_id: null, subcategoria_id: null }));
      return;
    }
    setCarregandoCats(true);
    fetch(
      `/api/categorias?departamento_id=${form.departamento_id}&pageSize=100`,
    )
      .then((r) => r.json())
      .then((d) => {
        setCategorias(d.data ?? d);
        setSubcategorias([]);
        setForm((f) => ({ ...f, categoria_id: null, subcategoria_id: null }));
      })
      .catch(() => {})
      .finally(() => setCarregandoCats(false));
  }, [form.departamento_id]);

  // Cascata categoria → subcategorias
  useEffect(() => {
    if (!form.categoria_id) {
      setSubcategorias([]);
      setForm((f) => ({ ...f, subcategoria_id: null }));
      return;
    }
    setCarregandoSubs(true);
    fetch(`/api/subcategorias?categoria_id=${form.categoria_id}&pageSize=100`)
      .then((r) => r.json())
      .then((d) => {
        setSubcategorias(d.data ?? d);
        setForm((f) => ({ ...f, subcategoria_id: null }));
      })
      .catch(() => {})
      .finally(() => setCarregandoSubs(false));
  }, [form.categoria_id]);

  // Busca de solicitante (perfil=cliente) com debounce — só executa com modal aberto
  useEffect(() => {
    if (!solicitanteModalAberto) return;
    if (!solicitanteBusca) {
      setSolicitanteResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      setBuscandoSolicitante(true);
      try {
        const res = await fetch(
          `/api/usuarios?perfil=cliente&q=${encodeURIComponent(solicitanteBusca)}&pageSize=20`,
        );
        if (res.ok) {
          const d = await res.json();
          setSolicitanteResultados(d.data ?? []);
        }
      } finally {
        setBuscandoSolicitante(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [solicitanteBusca, solicitanteModalAberto]);

  async function selecionarSolicitante(u: Usuario) {
    setSolicitanteId(u.id);
    setSolicitanteNomeSelecionado(u.nome);
    setSolicitanteModalAberto(false);
    setSolicitanteBusca("");
    setSolicitanteResultados([]);
    limparCliente();
    setSolicitanteClientes(null);
    try {
      const res = await fetch(`/api/clientes?usuario_id=${u.id}&pageSize=20`);
      if (res.ok) {
        const d = await res.json();
        const lista: ClienteOpcao[] = d.data ?? [];
        setSolicitanteClientes(lista);
        if (lista.length === 1) {
          selecionarCliente(lista[0]);
        } else if (lista.length > 1) {
          setClienteResultados(lista);
          setClienteDropdownAberto(true);
        }
      } else {
        setSolicitanteClientes([]);
      }
    } catch {
      setSolicitanteClientes([]);
    }
  }

  function limparSolicitante() {
    setSolicitanteId(null);
    setSolicitanteNomeSelecionado("");
    setSolicitanteBusca("");
    setSolicitanteResultados([]);
    setSolicitanteClientes(null);
    limparCliente();
  }

  // Busca de cliente com debounce
  useEffect(() => {
    if (!clienteBusca || clienteBusca === clienteNomeSelecionado) {
      setClienteResultados([]);
      return;
    }
    // Se há solicitante com clientes vinculados, filtrar localmente entre eles
    if (solicitanteClientes !== null && solicitanteClientes.length > 0) {
      const filtrados = solicitanteClientes.filter((c) =>
        c.nome_razao.toLowerCase().includes(clienteBusca.toLowerCase()),
      );
      setClienteResultados(filtrados);
      setClienteDropdownAberto(filtrados.length > 0);
      return;
    }
    const t = setTimeout(async () => {
      setBuscandoCliente(true);
      try {
        const res = await fetch(
          `/api/clientes?q=${encodeURIComponent(clienteBusca)}&pageSize=10`,
        );
        if (res.ok) {
          const d = await res.json();
          setClienteResultados(d.data ?? []);
          setClienteDropdownAberto(true);
        }
      } finally {
        setBuscandoCliente(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [clienteBusca, clienteNomeSelecionado, solicitanteClientes]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        clienteRef.current &&
        !clienteRef.current.contains(e.target as Node)
      ) {
        setClienteDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selecionarCliente(c: ClienteOpcao) {
    setForm((f) => ({ ...f, cliente_id: c.id }));
    setClienteNomeSelecionado(c.nome_razao);
    setClienteBusca(c.nome_razao);
    setClienteDropdownAberto(false);
  }

  function limparCliente() {
    setForm((f) => ({ ...f, cliente_id: null }));
    setClienteNomeSelecionado("");
    setClienteBusca("");
    setClienteResultados([]);
  }

  function abrirNovo() {
    setForm(formVazio);
    setClienteBusca("");
    setClienteNomeSelecionado("");
    setClienteResultados([]);
    setSolicitanteBusca("");
    setSolicitanteNomeSelecionado("");
    setSolicitanteResultados([]);
    setSolicitanteId(null);
    setSolicitanteModalAberto(false);
    setErro("");
    editorRef.current?.clear();
    setPainelAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      setErro("Assunto é obrigatório");
      return;
    }
    if (form.mensagem.replace(/<[^>]*>/g, "").trim().length < 10) {
      setErro("Mensagem deve ter pelo menos 10 caracteres");
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo,
          descricao: form.mensagem,
          prioridade_id: form.prioridade_id,
          cliente_id: form.cliente_id,
          categoria_id: form.categoria_id,
          subcategoria_id: form.subcategoria_id,
          departamento_id: form.departamento_id,
          atribuido_a: form.atribuido_a,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao criar ticket");
        return;
      }
      toast.success(`Ticket #${data.numero} criado com sucesso!`);
      setPainelAberto(false);
      setForm(formVazio);
      editorRef.current?.clear();
      carregar();
      router.push(`/painel/tickets/${data.id}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex h-full -mx-6 -mb-6">
      {/* ── Coluna esquerda: lista ── */}
      <div
        className={`flex flex-col transition-[width] duration-300 ${painelAberto ? "w-72 min-w-[288px]" : "flex-1"}`}
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderRight: "0.5px solid var(--color-border)",
        }}
      >
        <div
          className="flex-shrink-0"
          style={{
            padding: "16px 20px",
            borderBottom: "0.5px solid var(--color-border)",
          }}
        >
          {/* Botão novo ticket */}
          <button
            onClick={abrirNovo}
            className="tickets-btn-novo w-full flex items-center justify-between rounded-lg group"
            style={{
              padding: "8px 14px",
              marginBottom: 12,
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0.2)",
                }}
              >
                <Plus size={13} strokeWidth={2} />
              </div>
              <div className="text-left">
                <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
                  Novo ticket
                </p>
                {!painelAberto && (
                  <p
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.7)",
                      lineHeight: 1.2,
                    }}
                  >
                    Abrir chamado
                  </p>
                )}
              </div>
            </div>
            <ChevronRight
              size={14}
              style={{ color: "rgba(255,255,255,0.6)" }}
              className="group-hover:translate-x-0.5 transition-transform flex-shrink-0"
            />
          </button>

          {/* Busca */}
          <div className="relative">
            <Search
              className="absolute top-1/2 -translate-y-1/2"
              style={{
                left: 10,
                width: 13,
                height: 13,
                color: "var(--color-text-muted)",
              }}
              strokeWidth={1.5}
            />
            <Input
              placeholder="Buscar por assunto ou número..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 h-8"
              style={{ fontSize: 12.5 }}
            />
          </div>
          <p
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 6,
            }}
          >
            {total} ticket(s)
          </p>
          {meus && (
            <select
              value={situacaoMeus}
              onChange={(e) => setSituacaoMeus(e.target.value)}
              style={{
                marginTop: 6,
                width: "150px",
                fontSize: 11,
                padding: "2px 6px",
                height: 26,
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="">Todos</option>
              <option value="aberto">Aberto</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="aguardando">Aguardando</option>
              <option value="cancelado">Cancelado</option>
              <option value="finalizado">Finalizado</option>
            </select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          {loading && primeiroCarregamento ? (
            <div
              className="divide-y"
              style={{ borderColor: "var(--color-border)" }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-16 h-3 bg-gray-100 rounded animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/3" />
                  </div>
                  <div className="w-14 h-5 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
                  <div className="w-20 h-3 bg-gray-100 rounded animate-pulse flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div
              className="text-center py-12"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Ticket
                size={28}
                className="mx-auto mb-2"
                style={{ opacity: 0.3 }}
              />
              <p style={{ fontSize: 12 }}>Nenhum ticket encontrado</p>
            </div>
          ) : painelAberto ? (
            /* ── Modo compacto: painel aberto ── */
            ticketsOtimizados.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/painel/tickets/${t.id}`)}
                className="tickets-row-compact w-full flex items-start gap-3 text-left group"
                style={{
                  padding: "10px 16px",
                  borderBottom: "0.5px solid var(--color-border)",
                }}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: "var(--color-brand-light)",
                    marginTop: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "var(--color-brand)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    #{t.numero}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate"
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                      lineHeight: 1.4,
                    }}
                  >
                    {t.titulo}
                  </p>
                  <div
                    className="flex items-center gap-1.5 flex-wrap"
                    style={{ marginTop: 3 }}
                  >
                    <span
                      className="inline-flex items-center gap-1"
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <span
                        className="rounded-full flex-shrink-0"
                        style={{
                          width: 6,
                          height: 6,
                          backgroundColor: t.status_cor,
                          display: "inline-block",
                        }}
                      />
                      {t.status_nome}
                    </span>
                    <span style={{ color: "var(--color-border-hover)" }}>
                      ·
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: t.prioridade_cor,
                      }}
                    >
                      {t.prioridade_nome}
                    </span>
                  </div>
                  <p
                    className="truncate"
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-muted)",
                      marginTop: 2,
                    }}
                  >
                    {t.atribuido_nome ?? "Não atribuído"} ·{" "}
                    {t.dataFormatada}
                  </p>
                </div>
              </button>
            ))
          ) : (
            /* ── Modo tabela: lista completa ── */
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr
                  style={{
                    borderBottom: "0.5px solid var(--color-border)",
                    backgroundColor: "var(--color-bg-secondary)",
                  }}
                >
                  {[
                    "Protocolo",
                    "Assunto",
                    "Departamento",
                    "Cliente",
                    "Categoria",
                    "Data/Hora",
                    "Prioridade",
                    "Situação",
                    "Tempo / SLA",
                    "Atendente",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left whitespace-nowrap"
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--color-text-muted)",
                        padding: "8px 16px",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ticketsOtimizados.map((t) => (
                  <TicketTableRow
                    key={t.id}
                    ticket={t}
                    onClick={() => router.push(`/painel/tickets/${t.id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Painel direito: formulário ── */}
      <div
        className={`flex flex-col bg-gray-50 border-l border-gray-200 transition-[width] duration-300 overflow-hidden ${
          painelAberto ? "flex-1" : "w-0"
        }`}
      >
        {painelAberto && (
          <>
            {/* Cabeçalho */}
            <div className="flex items-start justify-between px-6 py-5 bg-white border-b border-gray-100 flex-shrink-0">
              <div>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-0.5">
                  NOVO TICKET
                </p>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">
                  Abrir chamado
                </h2>
              </div>
              <button
                onClick={() => setPainelAberto(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 mt-0.5"
              >
                <X size={16} />
              </button>
            </div>

            {/* Campos */}
            <form
              onSubmit={salvar}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto">
                <div className="bg-white">
                  {/* Solicitante — visível para admin/supervisor/operador */}
                  {sessao &&
                    ["admin", "supervisor", "operador"].includes(
                      sessao.perfil,
                    ) && (
                      <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                        <Label className="text-sm text-gray-600 w-28 flex-shrink-0">
                          Solicitante:
                        </Label>
                        <div className="flex-1 relative" ref={solicitanteRef}>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setSolicitanteModalAberto((v) => !v)
                              }
                              className="flex-1 h-8 flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              <span
                                className={
                                  solicitanteNomeSelecionado
                                    ? "text-gray-900"
                                    : "text-gray-400"
                                }
                              >
                                {solicitanteNomeSelecionado ||
                                  "Pesquisar solicitante..."}
                              </span>
                              <Search
                                size={13}
                                className="text-gray-400 flex-shrink-0"
                              />
                            </button>
                            {solicitanteId && (
                              <button
                                type="button"
                                onClick={limparSolicitante}
                                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                          {solicitanteModalAberto && (
                            <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                              <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
                                <Search
                                  size={13}
                                  className="text-gray-400 flex-shrink-0"
                                />
                                <input
                                  autoFocus
                                  type="text"
                                  value={solicitanteBusca}
                                  onChange={(e) =>
                                    setSolicitanteBusca(e.target.value)
                                  }
                                  placeholder="Pesquisar por nome..."
                                  className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                                />
                                {buscandoSolicitante && (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />
                                )}
                              </div>
                              <ul className="max-h-48 overflow-y-auto py-1">
                                {!solicitanteBusca && (
                                  <li className="px-3 py-2 text-sm text-gray-400 text-center">
                                    Digite para pesquisar usuários clientes
                                  </li>
                                )}
                                {solicitanteBusca &&
                                  !buscandoSolicitante &&
                                  solicitanteResultados.length === 0 && (
                                    <li className="px-3 py-2 text-sm text-gray-400 text-center">
                                      Nenhum usuário encontrado
                                    </li>
                                  )}
                                {solicitanteResultados.map((u) => (
                                  <li
                                    key={u.id}
                                    onMouseDown={() => selecionarSolicitante(u)}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50"
                                  >
                                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                      <User
                                        size={12}
                                        className="text-blue-600"
                                      />
                                    </div>
                                    <span className="text-gray-800">
                                      {u.nome}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Cliente */}
                  <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                    <Label className="text-sm text-gray-600 w-28 flex-shrink-0">
                      Cliente:
                    </Label>
                    <div className="flex-1 relative" ref={clienteRef}>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            value={clienteBusca}
                            onChange={(e) => {
                              setClienteBusca(e.target.value);
                              setClienteDropdownAberto(true);
                            }}
                            onFocus={() => {
                              if (clienteResultados.length > 0)
                                setClienteDropdownAberto(true);
                            }}
                            placeholder="Pesquisar cliente..."
                            className="h-8 text-sm pr-7"
                          />
                          {form.cliente_id && (
                            <button
                              type="button"
                              onClick={limparCliente}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              <X size={13} />
                            </button>
                          )}
                          {buscandoCliente && (
                            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                          )}
                          {clienteDropdownAberto &&
                            clienteResultados.length > 0 && (
                              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {clienteResultados.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => selecionarCliente(c)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                                  >
                                    <p className="font-medium text-gray-800">
                                      {c.nome_razao}
                                    </p>
                                    {c.documento && (
                                      <p className="text-xs text-gray-400">
                                        {c.documento}
                                      </p>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 text-xs px-3 whitespace-nowrap"
                          onClick={() =>
                            window.open("/painel/clientes", "_blank")
                          }
                        >
                          Criar Cliente...
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Departamento */}
                  <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                    <Label className="text-sm text-gray-600 w-28 flex-shrink-0">
                      Departamento:
                    </Label>
                    <div className="flex-1">
                      <Select
                        value={form.departamento_id ?? ""}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, departamento_id: v || null }))
                        }
                      >
                        <SelectTrigger className="h-8 text-sm border-gray-200 w-full">
                          <span className="flex flex-1 text-left text-sm truncate">
                            {form.departamento_id ? (
                              (departamentos.find(
                                (d) => d.id === form.departamento_id,
                              )?.nome ?? "")
                            ) : (
                              <span className="text-gray-400">
                                Escolher departamento...
                              </span>
                            )}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)]">
                          {departamentos.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Categoria (cascata do departamento) */}
                  {form.departamento_id && (
                    <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                      <Label className="text-sm text-gray-600 w-28 flex-shrink-0">
                        Categoria:
                      </Label>
                      <div className="flex-1">
                        {carregandoCats ? (
                          <div className="h-8 flex items-center text-sm text-gray-400 gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                            Carregando...
                          </div>
                        ) : categorias.length === 0 ? (
                          <div className="h-8 flex items-center text-sm text-gray-400">
                            Nenhuma categoria disponível
                          </div>
                        ) : (
                          <Select
                            value={form.categoria_id ?? ""}
                            onValueChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                categoria_id: v || null,
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 text-sm border-gray-200 w-full">
                              <span className="flex flex-1 text-left text-sm truncate">
                                {form.categoria_id ? (
                                  (categorias.find(
                                    (c) => c.id === form.categoria_id,
                                  )?.nome ?? "")
                                ) : (
                                  <span className="text-gray-400">
                                    Escolher categoria...
                                  </span>
                                )}
                              </span>
                            </SelectTrigger>
                            <SelectContent className="w-[var(--radix-select-trigger-width)]">
                              {categorias.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Subcategoria (cascata da categoria) */}
                  {form.categoria_id && (
                    <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                      <Label className="text-sm text-gray-600 w-28 flex-shrink-0">
                        Subcategoria:
                      </Label>
                      <div className="flex-1">
                        {carregandoSubs ? (
                          <div className="h-8 flex items-center text-sm text-gray-400 gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                            Carregando...
                          </div>
                        ) : subcategorias.length === 0 ? (
                          <div className="h-8 flex items-center text-sm text-gray-400">
                            Nenhuma subcategoria disponível
                          </div>
                        ) : (
                          <Select
                            value={form.subcategoria_id ?? ""}
                            onValueChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                subcategoria_id: v || null,
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 text-sm border-gray-200 w-full">
                              <span className="flex flex-1 text-left text-sm truncate">
                                {form.subcategoria_id ? (
                                  (subcategorias.find(
                                    (s) => s.id === form.subcategoria_id,
                                  )?.nome ?? "")
                                ) : (
                                  <span className="text-gray-400">
                                    Escolher subcategoria...
                                  </span>
                                )}
                              </span>
                            </SelectTrigger>
                            <SelectContent className="w-[var(--radix-select-trigger-width)]">
                              {subcategorias.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Assunto */}
                  <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                    <Label className="text-sm text-gray-600 w-28 flex-shrink-0">
                      Assunto:
                    </Label>
                    <div className="flex-1">
                      <Input
                        value={form.titulo}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, titulo: e.target.value }))
                        }
                        className="h-8 text-sm border-gray-200"
                      />
                    </div>
                  </div>

                  {/* Mensagem */}
                  <div className="flex items-start border-b border-gray-100 px-6 py-3 gap-4">
                    <Label className="text-sm text-gray-600 w-28 flex-shrink-0 pt-2">
                      Mensagem:
                    </Label>
                    <div className="flex-1">
                      <RichTextEditor
                        ref={editorRef}
                        value={form.mensagem}
                        onChange={(html) =>
                          setForm((f) => ({ ...f, mensagem: html }))
                        }
                        placeholder="Digite a mensagem para o cliente..."
                        disabled={salvando}
                      />
                    </div>
                  </div>

                  {/* Prioridade */}
                  <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                    <Label className="text-sm text-gray-600 w-28 flex-shrink-0">
                      Prioridade:
                    </Label>
                    <div className="flex-1">
                      <Select
                        value={form.prioridade_id ?? ""}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, prioridade_id: v || null }))
                        }
                      >
                        <SelectTrigger className="h-8 text-sm border-gray-200">
                          <span className="flex flex-1 items-center gap-2 text-sm">
                            {form.prioridade_id ? (
                              (() => {
                                const p = prioridades.find(
                                  (p) => p.id === form.prioridade_id,
                                );
                                return p ? (
                                  <>
                                    <span
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: p.cor }}
                                    />
                                    {p.nome}
                                  </>
                                ) : (
                                  ""
                                );
                              })()
                            ) : (
                              <span className="text-gray-400">
                                Definir Prioridade...
                              </span>
                            )}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {prioridades.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: p.cor }}
                                />
                                {p.nome}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Atendente — combobox com pesquisa */}
                  <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                    <Label className="text-sm text-gray-600 w-28 flex-shrink-0">
                      Atendente:
                    </Label>
                    <div className="flex-1 relative" ref={atendenteRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setAtendenteAberto((v) => !v);
                          setAtendenteBusca("");
                        }}
                        className="w-full h-8 flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-background px-3 text-sm text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <span
                          className={
                            form.atribuido_a ? "text-gray-900" : "text-gray-400"
                          }
                        >
                          {form.atribuido_a
                            ? (atendentes.find((u) => u.id === form.atribuido_a)
                                ?.nome ?? "")
                            : "Escolher atendente..."}
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {form.atribuido_a && (
                            <span
                              role="button"
                              tabIndex={0}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setForm((f) => ({ ...f, atribuido_a: null }));
                              }}
                              className="text-gray-400 hover:text-gray-700"
                            >
                              <X size={13} />
                            </span>
                          )}
                          <Search size={13} className="text-gray-400" />
                        </div>
                      </button>

                      {atendenteAberto && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                          <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
                            <Search
                              size={13}
                              className="text-gray-400 flex-shrink-0"
                            />
                            <input
                              autoFocus
                              type="text"
                              value={atendenteBusca}
                              onChange={(e) =>
                                setAtendenteBusca(e.target.value)
                              }
                              placeholder="Pesquisar atendente..."
                              className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                            />
                          </div>
                          <ul className="max-h-48 overflow-y-auto py-1">
                            {/* Sem atendente */}
                            <li
                              onMouseDown={() => {
                                setForm((f) => ({ ...f, atribuido_a: null }));
                                setAtendenteAberto(false);
                              }}
                              className={`flex items-center px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${
                                !form.atribuido_a ? "bg-gray-100" : ""
                              }`}
                            >
                              <span className="text-gray-400">
                                Sem atendente
                              </span>
                            </li>
                            {atendentesFiltrados.map((u) => (
                              <li
                                key={u.id}
                                onMouseDown={() => {
                                  setForm((f) => ({
                                    ...f,
                                    atribuido_a: u.id,
                                  }));
                                  setAtendenteAberto(false);
                                }}
                                className={`flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${
                                  form.atribuido_a === u.id
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-gray-900"
                                }`}
                              >
                                <span>{u.nome}</span>
                                {form.atribuido_a === u.id && (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </li>
                            ))}
                            {atendenteBusca &&
                              atendentesFiltrados.length === 0 && (
                                <li className="px-3 py-1.5 text-sm text-gray-400">
                                  Nenhum resultado
                                </li>
                              )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checkboxes */}
                  <div className="px-6 py-4 space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.notif_operador}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            notif_operador: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 accent-blue-600"
                      />
                      <span className="text-sm text-blue-600">
                        Receber respostas do cliente por email
                      </span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.notif_cliente}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            notif_cliente: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 accent-blue-600"
                      />
                      <span className="text-sm text-blue-600">
                        Enviar notificações por email para o cliente
                      </span>
                    </label>
                  </div>

                  {/* Mais Opções */}
                  <div className="px-6 pb-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 text-sm px-4 text-gray-600"
                    >
                      Mais Opções
                    </Button>
                  </div>

                  {erro && (
                    <div className="px-6 pb-4">
                      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {erro}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Rodapé */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 bg-white border-t border-gray-100 flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPainelAberto(false)}
                  className="h-9"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={salvando}
                  className="h-9 min-w-[110px]"
                >
                  {salvando ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-1.5" />
                  )}
                  Abrir ticket
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
});
