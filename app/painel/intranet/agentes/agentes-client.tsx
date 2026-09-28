"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Settings,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  Database,
  RefreshCw,
  Play,
  Code2,
  MessageSquarePlus,
  Sparkles,
  History,
  Archive,
} from "lucide-react";
import type {
  AgenteProposta,
  AgenteConfig,
  AgenteClientePublico,
  NivelRisco,
  PropostaStatus,
} from "@/agents/core/types";

interface Props {
  propostas: AgenteProposta[];
  config: AgenteConfig | null;
}

const RISCO_LABEL: Record<NivelRisco, { label: string; color: string }> = {
  baixo:   { label: "Baixo",   color: "#22c55e" },
  medio:   { label: "Médio",   color: "#f59e0b" },
  alto:    { label: "Alto",    color: "#ef4444" },
  critico: { label: "Crítico", color: "#7c3aed" },
};

const STATUS_CONFIG: Record<PropostaStatus, { label: string; icon: React.ReactNode; color: string }> = {
  aguardando: { label: "Aguardando", icon: <Clock size={13} />,        color: "#f59e0b" },
  aprovada:   { label: "Aprovada",   icon: <CheckCircle2 size={13} />, color: "#22c55e" },
  rejeitada:  { label: "Rejeitada",  icon: <XCircle size={13} />,      color: "#ef4444" },
  aplicada:   { label: "Aplicada",   icon: <Zap size={13} />,          color: "#3b82f6" },
  falhou:     { label: "Falhou",     icon: <AlertCircle size={13} />,  color: "#ef4444" },
  obsoleta:   { label: "Obsoleta",   icon: <Archive size={13} />,      color: "#94a3b8" },
};

const TIPO_LABEL: Record<string, string> = {
  configuracao:   "Configuração",
  dados:          "Dados",
  codigo:         "Código",
  infraestrutura: "Infraestrutura",
  outro:          "Outro",
};

function agruparPorCliente(propostas: AgenteProposta[]) {
  const mapa = new Map<string, AgenteProposta[]>();
  for (const p of propostas) {
    const chave = p.cliente_nome ?? "Geral";
    const grupo = mapa.get(chave) ?? [];
    grupo.push(p);
    mapa.set(chave, grupo);
  }
  // Geral sempre por último
  const geral = mapa.get("Geral");
  mapa.delete("Geral");
  const ordenado = new Map([...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)));
  if (geral) ordenado.set("Geral", geral);
  return ordenado;
}

export function AgentesClient({ propostas: inicial, config }: Props) {
  const router = useRouter();
  const [propostas, setPropostas] = useState(inicial);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [gruposColapsados, setGruposColapsados] = useState<Set<string>>(new Set());
  const [novoErro, setNovoErro] = useState({ descricao: "", contexto: "", stack: "", cliente_id: "" });
  const [showForm, setShowForm] = useState(false);
  const [clientes, setClientes] = useState<AgenteClientePublico[]>([]);
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [varrerInfo, setVarrerInfo] = useState<string | null>(null);
  // Refinamento inline por proposta — a proposta em si atualiza no lugar (mesmo id),
  // aqui só guardamos o histórico de instruções já enviadas (mais recente primeiro).
  const [refinarAberto, setRefinarAberto] = useState<Set<string>>(new Set());
  const [instrucoes, setInstrucoes] = useState<Record<string, string>>({});

  // Carrega lista de clientes ao abrir o formulario
  useEffect(() => {
    if (showForm && clientes.length === 0) {
      fetch("/api/agentes/clientes")
        .then((r) => r.json())
        .then((data) => Array.isArray(data) && setClientes(data.filter((c: AgenteClientePublico) => c.ativo)))
        .catch(() => {});
    }
  }, [showForm]);

  // Resolvidas (aplicada/rejeitada/aprovada/obsoleta) saem da tela principal assim que
  // mudam de status — ficam disponíveis só no Histórico. "Aprovada" também é estado final
  // aqui: o único jeito de chegar nela é aprovar uma proposta sem SQL pra aplicar (o botão
  // "Aprovar e Aplicar" pula "aprovada" direto pra "aplicada"/"falhou"). "Obsoleta" é
  // marcada pela própria varredura quando o erro de origem já não existe mais no painel.
  const ESTADOS_RESOLVIDOS = new Set(["aplicada", "rejeitada", "aprovada", "obsoleta"]);
  const propostasAtivas = propostas.filter((p) => !ESTADOS_RESOLVIDOS.has(p.status));

  const stats = {
    total:      propostas.length,
    aguardando: propostas.filter((p) => p.status === "aguardando").length,
    aprovadas:  propostas.filter((p) => p.status === "aprovada").length,
    aplicadas:  propostas.filter((p) => p.status === "aplicada").length,
  };

  async function handleAnalisar() {
    if (!novoErro.descricao.trim()) return;
    setLoading("analisar");
    setErro(null);
    try {
      const res = await fetch("/api/agentes/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao_erro: novoErro.descricao,
          contexto:       novoErro.contexto || undefined,
          stack_trace:    novoErro.stack || undefined,
          cliente_id:     novoErro.cliente_id || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error); return; }
      setPropostas([data.proposta, ...propostas]);
      setNovoErro({ descricao: "", contexto: "", stack: "", cliente_id: "" });
      setShowForm(false);
    } catch {
      setErro("Erro de comunicação. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  async function handleVarrer() {
    setLoading("varrer");
    setVarrerInfo(null);
    setErro(null);
    try {
      const res = await fetch("/api/agentes/varrer", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setErro(data.error); return; }
      const total = data.total_analisados ?? 0;
      // Diagnóstico: sem config ativa ou sem clientes configurados
      if (!data.ok && data.diagnostico) {
        setErro(data.diagnostico);
        return;
      }

      // Agrega confirmados, reanalise e obsoletos dos resultados
      const confirmados = (data.resultados as any[])?.reduce((s: number, r: any) => s + (r.erros_confirmados ?? 0), 0) ?? 0;
      const reanalise   = (data.resultados as any[])?.reduce((s: number, r: any) => s + (r.erros_reanalise ?? 0), 0) ?? 0;
      const obsoletos   = (data.resultados as any[])?.reduce((s: number, r: any) => s + (r.erros_obsoletos ?? 0), 0) ?? 0;

      const partes: string[] = [];
      if (total > 0)        partes.push(`${total} novo(s) analisado(s)`);
      if (reanalise > 0)    partes.push(`${reanalise} re-analisado(s) — correção anterior não resolveu`);
      if (confirmados > 0)  partes.push(`${confirmados} ainda ativo(s) no painel — proposta já aguardando`);
      if (obsoletos > 0)    partes.push(`${obsoletos} marcada(s) como obsoleta(s) — erro não existe mais no painel`);
      if (partes.length === 0) partes.push("Nenhum erro novo encontrado");

      let info = partes.join(" · ") + ".";
      if (data.diagnostico) info += ` ⚠️ ${data.diagnostico}`;
      setVarrerInfo(info);

      // Sempre recarrega — confirmados atualizam atualizado_em, reanalise cria novas propostas
      const r2 = await fetch("/api/agentes/propostas");
      if (r2.ok) {
        const novas = await r2.json();
        if (Array.isArray(novas)) setPropostas(novas);
      }
    } catch {
      setErro("Erro ao varrer. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  function toggleGrupo(nome: string) {
    setGruposColapsados((prev) => {
      const next = new Set(prev);
      next.has(nome) ? next.delete(nome) : next.add(nome);
      return next;
    });
  }

  async function handleAtualizarStatus(id: string, status: "aprovada" | "rejeitada") {
    setLoading(id + status);
    try {
      const res = await fetch(`/api/agentes/propostas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error); return; }
      setPropostas(propostas.map((p) => (p.id === id ? data : p)));
    } catch {
      setErro("Erro ao atualizar. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  function toggleRefinar(id: string) {
    setRefinarAberto((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setInstrucoes((prev) => ({ ...prev, [id]: "" }));
  }

  async function handleRefinar(propostaId: string, instrucaoRapida?: string) {
    const instrucao = (instrucaoRapida ?? instrucoes[propostaId])?.trim();
    if (!instrucao) return;
    setLoading(propostaId + "refinar");
    setErro(null);
    try {
      const res = await fetch(`/api/agentes/propostas/${propostaId}/refinar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrucao }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error); return; }
      // Atualiza o card existente no lugar (o backend retorna o mesmo id) — os botões de
      // Aprovar/Aplicar/Rejeitar no topo do card já refletem essa versão nova automaticamente.
      setPropostas((prev) => prev.map((p) => (p.id === propostaId ? data.proposta : p)));
      setInstrucoes((prev) => ({ ...prev, [propostaId]: "" }));
    } catch {
      setErro("Erro ao refinar. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  async function handleAplicar(id: string) {
    setLoading(id + "aplicar");
    setErro(null);
    try {
      const res = await fetch(`/api/agentes/propostas/${id}/aplicar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setErro(data.error); return; }
      setPropostas(propostas.map((p) => (p.id === id ? data.proposta : p)));
      setVarrerInfo(data.mensagem ?? "SQL aplicado com sucesso.");
    } catch {
      setErro("Erro ao aplicar. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--nav-active-bg, #6366f120)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bot size={22} style={{ color: "var(--nav-active-text, #6366f1)" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Agentes IA</h1>
            <p style={{ fontSize: 13, margin: 0, opacity: 0.6 }}>
              Análise automática de erros e propostas de correção
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => startTransition(() => router.push("/painel/intranet/agentes/clientes"))}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}
          >
            <Database size={14} /> Clientes
          </button>
          <button
            onClick={handleVarrer}
            disabled={loading === "varrer"}
            title="Varrer todos os bancos dos clientes agora"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13, opacity: loading === "varrer" ? 0.6 : 1 }}
          >
            {loading === "varrer" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Varrer
          </button>
          <button
            onClick={() => startTransition(() => router.push("/painel/intranet/agentes/config"))}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}
          >
            <Settings size={14} /> Configurar
          </button>
          <button
            onClick={() => startTransition(() => router.push("/painel/intranet/agentes/historico"))}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}
          >
            <History size={14} /> Histórico
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--nav-active-bg, #6366f1)", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
          >
            <Plus size={14} /> Analisar Erro
          </button>
        </div>
      </div>

      {/* Feedback varredura */}
      {varrerInfo && (
        <div style={{ padding: "10px 16px", background: "#22c55e18", border: "1px solid #22c55e40", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#166534" }}>
          <RefreshCw size={13} /> {varrerInfo}
          <button onClick={() => setVarrerInfo(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", opacity: 0.5, fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Alerta: agente desativado */}
      {!config?.ativo && (
        <div style={{ padding: "10px 16px", background: "#fef3c720", border: "1px solid #f59e0b40", borderRadius: 8, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#92400e" }}>
          <AlertCircle size={15} style={{ color: "#f59e0b" }} />
          Agente desativado.{" "}
          <a href="/painel/intranet/agentes/config" style={{ color: "#6366f1", textDecoration: "underline" }}>
            Ativar nas configurações
          </a>
        </div>
      )}

      {/* Cards de stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total",      value: stats.total,      color: "#6366f1" },
          { label: "Aguardando", value: stats.aguardando, color: "#f59e0b" },
          { label: "Aprovadas",  value: stats.aprovadas,  color: "#22c55e" },
          { label: "Aplicadas",  value: stats.aplicadas,  color: "#3b82f6" },
        ].map((s) => (
          <div key={s.label} style={{ padding: "16px 20px", borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)" }}>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Formulário: novo erro */}
      {showForm && (
        <div style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>Descrever Erro para Análise</h3>

          {/* Seletor de cliente */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>
              <Database size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              Cliente / Base de dados <span style={{ opacity: 0.5, fontWeight: 400 }}>(opcional)</span>
            </label>
            <select
              value={novoErro.cliente_id}
              onChange={(e) => setNovoErro({ ...novoErro, cliente_id: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, background: "var(--card-bg, white)", marginBottom: 2 }}
            >
              <option value="">— Erro geral (sem cliente específico) —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.db_host}/{c.db_nome})
                </option>
              ))}
            </select>
            {clientes.length === 0 && (
              <p style={{ margin: 0, fontSize: 11, opacity: 0.45 }}>
                Nenhum cliente cadastrado.{" "}
                <a href="/painel/intranet/agentes/clientes" style={{ color: "#6366f1" }}>Cadastrar cliente</a>
              </p>
            )}
          </div>

          <textarea
            value={novoErro.descricao}
            onChange={(e) => setNovoErro({ ...novoErro, descricao: e.target.value })}
            placeholder="Descreva o erro ocorrido (obrigatório)..."
            rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", resize: "vertical", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
          />
          <textarea
            value={novoErro.contexto}
            onChange={(e) => setNovoErro({ ...novoErro, contexto: e.target.value })}
            placeholder="Contexto adicional (módulo, versão, fluxo onde ocorreu)..."
            rows={2}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", resize: "vertical", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
          />
          <textarea
            value={novoErro.stack}
            onChange={(e) => setNovoErro({ ...novoErro, stack: e.target.value })}
            placeholder="Stack trace (opcional)..."
            rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", resize: "vertical", fontSize: 13, fontFamily: "monospace", marginBottom: 14, boxSizing: "border-box" }}
          />
          {erro && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{erro}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleAnalisar}
              disabled={loading === "analisar" || !novoErro.descricao.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 500, opacity: loading === "analisar" ? 0.7 : 1 }}
            >
              {loading === "analisar" ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
              {loading === "analisar" ? "Analisando..." : "Analisar com IA"}
            </button>
            <button
              onClick={() => { setShowForm(false); setErro(null); }}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de propostas agrupadas por cliente — só as ativas (aguardando/aprovada/falhou).
          Aplicadas e rejeitadas saem daqui e ficam no Histórico. */}
      {propostasAtivas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", opacity: 0.5 }}>
          <Bot size={40} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 15, margin: 0 }}>Nenhuma proposta pendente</p>
          <p style={{ fontSize: 13, margin: "4px 0 0" }}>Clique em "Varrer" para buscar erros nos clientes ou em "Analisar Erro" para inserir manualmente</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {[...agruparPorCliente(propostasAtivas)].map(([grupo, itens]) => {
            const colapsado = gruposColapsados.has(grupo);
            const aguardando = itens.filter((p) => p.status === "aguardando").length;
            return (
              <div key={grupo}>
                {/* Cabeçalho do grupo */}
                <button
                  onClick={() => toggleGrupo(grupo)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "0 0 8px", width: "100%", textAlign: "left" }}
                >
                  {grupo !== "Geral" && <Database size={14} style={{ color: "#6366f1", flexShrink: 0 }} />}
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{grupo}</span>
                  <span style={{ fontSize: 12, opacity: 0.45, marginLeft: 4 }}>{itens.length} proposta{itens.length !== 1 ? "s" : ""}</span>
                  {aguardando > 0 && (
                    <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 20, background: "#f59e0b18", color: "#92400e", fontWeight: 500 }}>
                      {aguardando} aguardando
                    </span>
                  )}
                  <span style={{ marginLeft: "auto" }}>
                    {colapsado ? <ChevronDown size={14} style={{ opacity: 0.4 }} /> : <ChevronUp size={14} style={{ opacity: 0.4 }} />}
                  </span>
                </button>

                {!colapsado && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {itens.map((p) => {
                      const st = STATUS_CONFIG[p.status];
                      const risco = RISCO_LABEL[p.nivel_risco];
                      const isOpen = expandido === p.id;

                      return (
                        <div key={p.id} style={{ borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", overflow: "hidden" }}>
                          <div
                            onClick={() => setExpandido(isOpen ? null : p.id)}
                            style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: st.color, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: st.color + "18" }}>
                                  {st.icon} {st.label}
                                </span>
                                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: risco.color + "18", color: risco.color, fontWeight: 500 }}>
                                  Risco: {risco.label}
                                </span>
                                <span style={{ fontSize: 12, opacity: 0.5, padding: "2px 8px", borderRadius: 20, background: "#00000010" }}>
                                  {TIPO_LABEL[p.tipo] ?? p.tipo}
                                </span>
                              </div>
                              <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{p.titulo}</p>
                              <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.5 }}>
                                {new Date(p.criado_em).toLocaleString("pt-BR")}
                                {p.aprovado_por_nome && ` · Aprovado por ${p.aprovado_por_nome}`}
                              </p>
                            </div>
                            {isOpen ? <ChevronUp size={16} style={{ opacity: 0.4 }} /> : <ChevronDown size={16} style={{ opacity: 0.4 }} />}
                          </div>

                          {isOpen && (
                            <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 16 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                                <div>
                                  <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", opacity: 0.5 }}>Erro Relatado</p>
                                  <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{p.descricao_erro}</p>
                                </div>
                                <div>
                                  <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", opacity: 0.5 }}>Análise da IA</p>
                                  <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{p.analise}</p>
                                </div>
                              </div>
                              <div style={{ marginBottom: 16 }}>
                                <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", opacity: 0.5 }}>Correção Proposta</p>
                                <div style={{ padding: "12px 14px", borderRadius: 8, background: "#f8fafc", border: "1px solid var(--border, #e5e7eb)", fontSize: 13, whiteSpace: "pre-wrap" }}>
                                  {p.correcao_proposta}
                                </div>
                              </div>

                              {p.sql_correcao && (
                                <div style={{ marginBottom: 16 }}>
                                  <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", opacity: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
                                    <Code2 size={12} /> SQL de Correção
                                  </p>
                                  <pre style={{ margin: 0, padding: "12px 14px", borderRadius: 8, background: "#0f172a", color: "#e2e8f0", fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap", border: "1px solid #334155" }}>
                                    {p.sql_correcao}
                                  </pre>
                                </div>
                              )}

                              {p.aplicacao_erro && (
                                <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12, color: "#dc2626" }}>
                                  <strong>Erro na aplicação:</strong> {p.aplicacao_erro}
                                </div>
                              )}

                              {p.status === "aguardando" && (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {p.sql_correcao && p.cliente_id ? (
                                    <button
                                      onClick={() => handleAplicar(p.id)}
                                      disabled={!!loading}
                                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                                    >
                                      {loading === p.id + "aplicar" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                      Aprovar e Aplicar
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleAtualizarStatus(p.id, "aprovada")}
                                      disabled={!!loading}
                                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "#22c55e", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                                    >
                                      {loading === p.id + "aprovada" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                      Aprovar
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleAtualizarStatus(p.id, "rejeitada")}
                                    disabled={!!loading}
                                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 13 }}
                                  >
                                    {loading === p.id + "rejeitada" ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                                    Rejeitar
                                  </button>
                                  <button
                                    onClick={() => toggleRefinar(p.id)}
                                    disabled={!!loading}
                                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #6366f1", background: "transparent", color: "#6366f1", cursor: "pointer", fontSize: 13 }}
                                  >
                                    <MessageSquarePlus size={13} />
                                    {refinarAberto.has(p.id) ? "Fechar Refinamento" : "Refinar com IA"}
                                  </button>
                                </div>
                              )}

                              {/* Painel de refinamento inline — só a conversa (instrução + IA). As
                                  ações (Aprovar/Aplicar/Rejeitar) ficam únicas, no bloco acima, e já
                                  refletem a versão mais recente porque a proposta atualiza no lugar. */}
                              {refinarAberto.has(p.id) && (
                                <div style={{ marginTop: 16, padding: "16px", borderRadius: 10, background: "#f0f4ff", border: "1px solid #c7d2fe" }}>
                                  <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#3730a3", display: "flex", alignItems: "center", gap: 6 }}>
                                    <Sparkles size={14} /> Refinar análise com IA
                                  </p>

                                  {/* Histórico de instruções já enviadas — mais recente no topo */}
                                  {(p.instrucoes_anteriores?.length ?? 0) > 0 && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                                      {[...p.instrucoes_anteriores].reverse().map((h, i) => (
                                        <div key={i} style={{ padding: "8px 10px", borderRadius: 8, background: "white", border: "1px solid #dbe0fb", fontSize: 12 }}>
                                          <p style={{ margin: "0 0 3px", opacity: 0.6 }}>Você: {h.instrucao}</p>
                                          <p style={{ margin: 0, color: "#3730a3", fontWeight: 500 }}>→ {h.titulo}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "#4338ca", opacity: 0.8 }}>
                                    Descreva o que precisa ser ajustado, adicione contexto ou diga o que não funcionou. A IA aproveita o que já foi confirmado antes e gera uma nova proposta.
                                  </p>
                                  <textarea
                                    value={instrucoes[p.id] ?? ""}
                                    onChange={(e) => setInstrucoes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                    placeholder="Ex: O erro ocorre apenas para vendas com parcelamento. O campo afetado é o pedido_parcela, não o pedido. Verifique a FK nessa tabela."
                                    rows={3}
                                    disabled={!!loading}
                                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #a5b4fc", resize: "vertical", fontSize: 13, marginBottom: 10, boxSizing: "border-box", background: "white" }}
                                  />
                                  <button
                                    onClick={() => handleRefinar(p.id)}
                                    disabled={!!loading || !instrucoes[p.id]?.trim()}
                                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none", background: "#4f46e5", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (!instrucoes[p.id]?.trim() || !!loading) ? 0.6 : 1 }}
                                  >
                                    {loading === p.id + "refinar" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                    {loading === p.id + "refinar" ? "Analisando..." : "Enviar para IA"}
                                  </button>
                                  {p.painel_codigo && (
                                    <button
                                      onClick={() => handleRefinar(p.id, "Ajuste já feito, apenas reprocessar painel")}
                                      disabled={!!loading}
                                      style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "1px solid #4f46e5", background: "white", color: "#4f46e5", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1 }}
                                      title="Gera na hora o UPDATE reprocessar=true para este registro, sem consultar a IA"
                                    >
                                      Ajuste já feito: só reprocessar painel (instantâneo)
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
