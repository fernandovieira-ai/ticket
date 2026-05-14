"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  Loader2,
  Ticket,
  Plus,
  ChevronRight,
  X,
  Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  RichTextEditor,
  type RichTextEditorRef,
} from "@/components/ui/rich-text-editor";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Tipos                                                                */
/* ------------------------------------------------------------------ */
interface TicketRow {
  id: string;
  numero: string;
  titulo: string;
  canal: string;
  status_nome: string;
  status_cor: string;
  status_codigo: string;
  prioridade_nome: string;
  prioridade_cor: string;
  departamento_nome: string | null;
  categoria_nome: string | null;
  atribuido_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

const CODIGOS_ABERTOS = ["aberto", "em_andamento", "aguardando"];
const CODIGOS_FECHADOS = ["finalizado", "cancelado"];

// Estilos estáticos para evitar recriação
const ESTILOS = {
  container: { minHeight: "calc(100vh - 56px)" },
  toolbar: {
    padding: "12px 20px",
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
  },
  botaoNovo: { padding: "8px 14px", minWidth: 180 },
  iconNovo: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  textoNovo: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 },
  subtextoNovo: {
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 1.2,
  },
  busca: { minWidth: 200, maxWidth: 360 },
  iconBusca: { left: 10, width: 13, height: 13, color: "#9ca3af" },
  inputBusca: { fontSize: 13 },
  headerTabela: {
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
  },
  thTabela: {
    fontSize: 10,
    fontWeight: 600,
    color: "#9ca3af",
    padding: "8px 16px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  tdPadding: { padding: "10px 16px" },
  numeroTicket: { fontSize: 13, fontWeight: 700, color: "#111827" },
  tituloTicket: { fontSize: 13, fontWeight: 500, color: "#111827" },
  operador: { fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "uppercase" as const },
  operadorVazio: { color: "#d1d5db", fontWeight: 400, textTransform: "none" as const },
  dataTexto: { fontSize: 11, color: "#6b7280" },
};

interface ClienteOpcao {
  id: string;
  nome_razao: string;
}

interface DepartamentoOpcao {
  id: string;
  nome: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function tempoRelativo(data: string): string {
  const agora = new Date();
  const d = new Date(data);
  const diffMs = agora.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias >= 1) return `${diffDias} dia${diffDias !== 1 ? "s" : ""}`;
  if (diffHoras >= 1) {
    const minRest = diffMin % 60;
    return minRest > 0 ? `${diffHoras} hs ${minRest} min` : `${diffHoras} hs`;
  }
  return `${diffMin} min`;
}

// Cache para formatação de datas - evita recálculos
const dataCache = new Map<string, string>();
const tempoRelativoCache = new Map<string, { valor: string; timestamp: number }>();

function formatarDataMemoizada(data: string): string {
  const key = data;
  if (!dataCache.has(key)) {
    dataCache.set(key, format(new Date(data), "dd/MM/yyyy HH:mm", { locale: ptBR }));
  }
  return dataCache.get(key)!;
}

function tempoRelativoMemoizado(data: string): string {
  const key = data;
  const agora = Date.now();
  const cached = tempoRelativoCache.get(key);

  // Cache válido por 1 minuto
  if (cached && agora - cached.timestamp < 60000) {
    return cached.valor;
  }

  const valor = tempoRelativo(data);
  tempoRelativoCache.set(key, { valor, timestamp: agora });
  return valor;
}

/* ------------------------------------------------------------------ */
/* Componente                                                           */
/* ------------------------------------------------------------------ */
export const MeusTicketsClient = React.memo(function MeusTicketsClient() {
  const router = useRouter();
  const editorRef = useRef<RichTextEditorRef>(null);

  /* lista de tickets */
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"abertos" | "fechados">("abertos");
  const loadingRef = useRef(false); // Ref para evitar race conditions
  const [primeiroCarregamento, setPrimeiroCarregamento] = useState(true);

  /* dialog novo ticket */
  const [dialogAberto, setDialogAberto] = useState(false);
  const [empresas, setEmpresas] = useState<ClienteOpcao[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcao[]>([]);
  const [form, setForm] = useState({
    cliente_id: "",
    departamento_id: "",
    titulo: "",
    descricao: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  /* carregar tickets */
  const carregar = useCallback(async () => {
    // Evitar loading desnecessário se já está carregando
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    let isMounted = true; // Flag para verificar se componente ainda está montado

    try {
      const params = new URLSearchParams({ pageSize: "200" });
      const res = await fetch(`/api/tickets?${params}`);

      // Só processa se o componente ainda estiver montado
      if (!isMounted) return;

      const data = await res.json();
      const lista = (data.data ?? []) as TicketRow[];
      lista.sort((a, b) => Number(b.numero) - Number(a.numero));
      setTickets(lista);
      if (primeiroCarregamento) {
        setPrimeiroCarregamento(false);
      }
    } catch (error) {
      console.error('[MeusTickets] Erro ao carregar tickets:', error);
    } finally {
      if (isMounted) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  }, [primeiroCarregamento]);

  useEffect(() => {
    carregar();

    // Cleanup quando componente for desmontado
    return () => {
      loadingRef.current = false;
    };
  }, []); // Sem dependências - carrega apenas uma vez no mount

  // Cleanup geral quando componente for desmontado
  useEffect(() => {
    return () => {
      // Reset todos os states para valores iniciais
      setLoading(false);
      setTickets([]);
      loadingRef.current = false;
    };
  }, []);

  /* filtros client-side — memoizados para evitar recálculo a cada render */
  const { ticketsFiltrados, totalAbertos, totalFechados } = useMemo(() => {
    const codigosFiltro = aba === "abertos" ? CODIGOS_ABERTOS : CODIGOS_FECHADOS;
    const buscaNorm = busca.trim().toLowerCase();
    let abertos = 0;
    let fechados = 0;
    const filtrados: TicketRow[] = [];

    for (const t of tickets) {
      if (CODIGOS_ABERTOS.includes(t.status_codigo)) abertos++;
      else if (CODIGOS_FECHADOS.includes(t.status_codigo)) fechados++;

      const naAba = codigosFiltro.includes(t.status_codigo);
      if (!naAba) continue;
      if (buscaNorm && !t.titulo.toLowerCase().includes(buscaNorm) && !t.numero.includes(buscaNorm)) continue;
      filtrados.push(t);
    }

    return { ticketsFiltrados: filtrados, totalAbertos: abertos, totalFechados: fechados };
  }, [tickets, aba, busca]);

  /* abrir dialog e carregar dados */
  async function abrirDialog() {
    setForm({ cliente_id: "", departamento_id: "", titulo: "", descricao: "" });
    setErro("");
    editorRef.current?.clear();
    setDialogAberto(true);

    const [resMe, resDep] = await Promise.all([
      fetch("/api/auth/me"),
      fetch("/api/departamentos?pageSize=100"),
    ]);

    if (resMe.ok) {
      const me = await resMe.json();
      const resEmp = await fetch(
        `/api/clientes?usuario_id=${me.sub}&pageSize=50`,
      );
      if (resEmp.ok) {
        const d = await resEmp.json();
        const lista: ClienteOpcao[] = d.data ?? [];
        setEmpresas(lista);
        if (lista.length === 1) {
          setForm((f) => ({ ...f, cliente_id: lista[0].id }));
        }
      }
    }

    if (resDep.ok) {
      const d = await resDep.json();
      setDepartamentos(d.data ?? d);
    }
  }

  /* enviar novo ticket */
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      setErro("Informe o assunto do chamado.");
      return;
    }
    if (form.descricao.replace(/<[^>]*>/g, "").trim().length < 10) {
      setErro("Descreva o problema com pelo menos 10 caracteres.");
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
          descricao: form.descricao,
          cliente_id: form.cliente_id || null,
          departamento_id: form.departamento_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao criar ticket");
        return;
      }
      toast.success(`Ticket #${data.numero} criado com sucesso!`);
      setDialogAberto(false);
      carregar();
      router.push(`/portal/meus-tickets/${data.id}`);
    } finally {
      setSalvando(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */
  return (
    <>
      {/* ============================================================ */}
      {/* Dialog - Novo Ticket                                         */}
      {/* ============================================================ */}
      {dialogAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialogAberto(false);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full flex flex-col"
            style={{ maxWidth: 700, maxHeight: "90vh" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--color-brand)" }}>
                  NOVO TICKET
                </p>
                <h2 className="text-xl font-bold text-gray-900">
                  Abrir chamado
                </h2>
              </div>
              <button
                onClick={() => setDialogAberto(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 mt-0.5"
              >
                <X size={18} />
              </button>
            </div>

            {/* Campos */}
            <form
              onSubmit={enviar}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto">
                {/* Empresa */}
                <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                  <label className="text-sm font-medium text-gray-700 w-32 flex-shrink-0">
                    Empresa:
                  </label>
                  {empresas.length === 0 ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : empresas.length === 1 ? (
                    <span className="text-sm text-gray-700">
                      {empresas[0].nome_razao}
                    </span>
                  ) : (
                    <div className="flex-1 flex items-center border border-gray-200 rounded-lg overflow-hidden h-9">
                      <span className="px-3 text-sm text-gray-400 border-r border-gray-200 h-full flex items-center">
                        Pesquisar
                      </span>
                      <select
                        value={form.cliente_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, cliente_id: e.target.value }))
                        }
                        className="flex-1 px-3 h-full bg-white text-sm text-gray-900 focus:outline-none"
                      >
                        <option value="">Selecionar empresa...</option>
                        {empresas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome_razao}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Departamento */}
                <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                  <label className="text-sm font-medium text-gray-700 w-32 flex-shrink-0">
                    Departamento:
                  </label>
                  <select
                    value={form.departamento_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        departamento_id: e.target.value,
                      }))
                    }
                    className="flex-1 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Escolher departamento...</option>
                    {departamentos.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assunto */}
                <div className="flex items-center border-b border-gray-100 px-6 py-3 gap-4">
                  <label className="text-sm font-medium text-gray-700 w-32 flex-shrink-0">
                    Assunto:
                  </label>
                  <Input
                    value={form.titulo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, titulo: e.target.value }))
                    }
                    placeholder="Ex: Erro ao emitir NF-e..."
                    maxLength={300}
                    className="flex-1 h-9"
                  />
                </div>

                {/* Mensagem */}
                <div className="flex items-start border-b border-gray-100 px-6 py-3 gap-4">
                  <label className="text-sm font-medium text-gray-700 w-32 flex-shrink-0 mt-2">
                    Mensagem:
                  </label>
                  <div className="flex-1">
                    <RichTextEditor
                      ref={editorRef}
                      value={form.descricao}
                      onChange={(html) =>
                        setForm((f) => ({ ...f, descricao: html }))
                      }
                      placeholder="Digite a mensagem para o cliente..."
                      disabled={salvando}
                    />
                  </div>
                </div>

                {erro && (
                  <div className="mx-6 my-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {erro}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setDialogAberto(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-60"
                  style={{
                    backgroundColor: "var(--color-brand)",
                  }}
                  onMouseEnter={(e) => {
                    if (!salvando) {
                      e.currentTarget.style.backgroundColor = "var(--color-brand-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!salvando) {
                      e.currentTarget.style.backgroundColor = "var(--color-brand)";
                    }
                  }}
                >
                  {salvando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Enviar chamado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Layout principal                                              */}
      {/* ============================================================ */}
      <div
        className="flex flex-col bg-gray-50 -mx-4 -mb-6"
        style={{ minHeight: "calc(100vh - 56px)" }}
      >
        <div className="px-12 py-12 flex flex-col gap-0 flex-1">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col flex-1">
            {/* Toolbar */}
            <div
              className="flex-shrink-0 flex items-center gap-3 flex-wrap"
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
              }}
            >
              <button
                onClick={() => router.push("/portal/novo-ticket")}
                className="tickets-btn-novo flex items-center justify-between rounded-lg group flex-shrink-0"
                style={{
                  padding: "8px 14px",
                  minWidth: 180,
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
                    <p
                      style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}
                    >
                      Novo ticket
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.7)",
                        lineHeight: 1.2,
                      }}
                    >
                      Abrir chamado
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  style={{ color: "rgba(255,255,255,0.6)" }}
                  className="group-hover:translate-x-0.5 transition-transform flex-shrink-0 ml-3"
                />
              </button>

              {/* Busca */}
              <div
                className="relative flex-1"
                style={{ minWidth: 200, maxWidth: 360 }}
              >
                <Search
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: 10, width: 13, height: 13, color: "#9ca3af" }}
                  strokeWidth={1.5}
                />
                <Input
                  placeholder="Buscar por assunto ou numero..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8 h-9"
                  style={{ fontSize: 13 }}
                />
              </div>
            </div>

            {/* Abas */}
            <div
              className="flex-shrink-0 flex items-end gap-0"
              style={{
                backgroundColor: "#ffffff",
                borderBottom: "1px solid #e5e7eb",
                paddingLeft: 20,
              }}
            >
              {(["abertos", "fechados"] as const).map((a) => {
                const ativo = aba === a;
                const count = a === "abertos" ? totalAbertos : totalFechados;
                return (
                  <button
                    key={a}
                    onClick={() => setAba(a)}
                    style={{
                      padding: "10px 18px",
                      fontSize: 13,
                      fontWeight: ativo ? 600 : 400,
                      color: ativo ? "var(--color-brand)" : "#6b7280",
                      borderBottom: ativo
                        ? "2px solid var(--color-brand)"
                        : "2px solid transparent",
                      background: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "color 0.15s",
                      marginBottom: -1,
                    }}
                  >
                    {a === "abertos" ? "Abertos" : "Fechados"}
                    {!loading && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 10,
                          backgroundColor: ativo ? "var(--color-brand-light)" : "#f3f4f6",
                          color: ativo ? "var(--color-brand)" : "#9ca3af",
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tabela */}
            <div className="flex-1 overflow-auto bg-gray-50">
              {loading && primeiroCarregamento ? (
                <div className="flex justify-center items-center h-full py-20">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : ticketsFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Ticket size={36} className="mb-3 opacity-30" />
                  <p className="text-base font-medium text-gray-500 mb-1">
                    {busca ? "Nenhum ticket encontrado" : "Nenhum ticket ainda"}
                  </p>
                  <p className="text-sm text-gray-400">
                    {busca
                      ? "Tente alterar a busca"
                      : aba === "abertos"
                        ? "Clique em Novo ticket para criar seu primeiro chamado"
                        : "Nenhum chamado finalizado ou cancelado"}
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid #e5e7eb",
                        backgroundColor: "#f9fafb",
                      }}
                    >
                      {[
                        "Ticket",
                        "Assunto",
                        "Operador",
                        "Criado em",
                        "Alterado há",
                        "Status",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left whitespace-nowrap"
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#9ca3af",
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
                    {ticketsFiltrados.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() =>
                          router.push(`/portal/meus-tickets/${t.id}`)
                        }
                        className="tickets-table-row"
                      >
                        <td
                          className="whitespace-nowrap"
                          style={{ padding: "10px 16px" }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#111827",
                            }}
                          >
                            {t.numero}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", maxWidth: 260 }}>
                          <p
                            className="truncate"
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#111827",
                            }}
                          >
                            {t.titulo}
                          </p>
                        </td>
                        <td style={{ padding: "10px 16px", maxWidth: 180 }}>
                          <span
                            className="truncate block"
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#374151",
                              textTransform: "uppercase",
                            }}
                          >
                            {t.atribuido_nome ?? (
                              <span
                                style={{
                                  color: "#d1d5db",
                                  fontWeight: 400,
                                  textTransform: "none",
                                }}
                              >
                                -
                              </span>
                            )}
                          </span>
                        </td>
                        <td
                          className="whitespace-nowrap"
                          style={{ padding: "10px 16px" }}
                        >
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            {formatarDataMemoizada(t.criado_em)}
                          </span>
                        </td>
                        <td
                          className="whitespace-nowrap"
                          style={{ padding: "10px 16px" }}
                        >
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            {tempoRelativoMemoizado(t.atualizado_em)}
                          </span>
                        </td>
                        <td
                          className="whitespace-nowrap"
                          style={{ padding: "10px 16px" }}
                        >
                          <span
                            className="inline-flex items-center gap-1"
                            style={{
                              padding: "2px 8px",
                              borderRadius: 20,
                              fontSize: 10,
                              fontWeight: 600,
                              backgroundColor: t.status_cor + "20",
                              color: t.status_cor,
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          {/* card */}
        </div>
        {/* px-6 container */}
      </div>
    </>
  );
});
