"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  Database,
  Code2,
  History,
  BrainCircuit,
  Archive,
} from "lucide-react";
import type { AgenteProposta, AgenteConhecimento, NivelRisco, PropostaStatus } from "@/agents/core/types";

interface Props {
  propostas: AgenteProposta[];
  conhecimento: AgenteConhecimento[];
}

const RISCO_LABEL: Record<NivelRisco, { label: string; color: string }> = {
  baixo:   { label: "Baixo",   color: "#22c55e" },
  medio:   { label: "Médio",   color: "#f59e0b" },
  alto:    { label: "Alto",    color: "#ef4444" },
  critico: { label: "Crítico", color: "#7c3aed" },
};

const STATUS_CONFIG: Record<PropostaStatus, { label: string; icon: React.ReactNode; color: string }> = {
  aguardando: { label: "Aguardando", icon: null,                        color: "#f59e0b" },
  aprovada:   { label: "Aprovada",   icon: <CheckCircle2 size={13} />,  color: "#22c55e" },
  rejeitada:  { label: "Rejeitada",  icon: <XCircle size={13} />,       color: "#ef4444" },
  aplicada:   { label: "Aplicada",   icon: <Zap size={13} />,           color: "#3b82f6" },
  falhou:     { label: "Falhou",     icon: null,                        color: "#ef4444" },
  obsoleta:   { label: "Obsoleta",   icon: <Archive size={13} />,       color: "#94a3b8" },
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
  const geral = mapa.get("Geral");
  mapa.delete("Geral");
  const ordenado = new Map([...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)));
  if (geral) ordenado.set("Geral", geral);
  return ordenado;
}

export function HistoricoClient({ propostas, conhecimento }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [aba, setAba] = useState<"propostas" | "conhecimento">("propostas");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "aplicada" | "aprovada" | "rejeitada" | "obsoleta">("todas");

  const filtradas = filtro === "todas" ? propostas : propostas.filter((p) => p.status === filtro);
  const grupos = agruparPorCliente(filtradas);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => startTransition(() => router.push("/painel/intranet/agentes"))}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}
          >
            <ArrowLeft size={14} />
          </button>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--nav-active-bg, #6366f120)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <History size={22} style={{ color: "var(--nav-active-text, #6366f1)" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Histórico</h1>
            <p style={{ fontSize: 13, margin: 0, opacity: 0.6 }}>
              Correções resolvidas e o que a IA aprendeu com elas
            </p>
          </div>
        </div>
        {aba === "propostas" && (
          <div style={{ display: "flex", gap: 6 }}>
            {(["todas", "aplicada", "aprovada", "rejeitada", "obsoleta"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                  border: filtro === f ? "1px solid #6366f1" : "1px solid var(--border, #e5e7eb)",
                  background: filtro === f ? "#6366f118" : "transparent",
                  color: filtro === f ? "#6366f1" : "inherit",
                  fontWeight: filtro === f ? 600 : 400,
                }}
              >
                {f === "todas" ? "Todas" : f === "aplicada" ? "Aplicadas" : f === "aprovada" ? "Aprovadas" : f === "rejeitada" ? "Rejeitadas" : "Obsoletas"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        {([
          { key: "propostas" as const, label: `Propostas (${propostas.length})`, icon: <History size={14} /> },
          { key: "conhecimento" as const, label: `Base de Conhecimento (${conhecimento.length})`, icon: <BrainCircuit size={14} /> },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setAba(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer",
              background: "none", border: "none", borderBottom: aba === t.key ? "2px solid #6366f1" : "2px solid transparent",
              color: aba === t.key ? "#6366f1" : "inherit", fontWeight: aba === t.key ? 600 : 400, marginBottom: -1,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {aba === "conhecimento" && (
        conhecimento.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", opacity: 0.5 }}>
            <BrainCircuit size={40} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 15, margin: 0 }}>Nenhuma lição aprendida ainda</p>
            <p style={{ fontSize: 13, margin: "4px 0 0" }}>Toda vez que uma proposta é aprovada ou aplicada com sucesso, a IA extrai o padrão generalizável e guarda aqui</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {conhecimento.map((k) => (
              <div key={k.id} style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#6366f118", color: "#6366f1", fontFamily: "monospace" }}>
                    {k.topico}
                  </span>
                  {k.vezes_reforcada > 1 && (
                    <span style={{ fontSize: 11, opacity: 0.5 }}>reforçada {k.vezes_reforcada}x</span>
                  )}
                  <span style={{ fontSize: 11, opacity: 0.4, marginLeft: "auto" }}>
                    {new Date(k.atualizado_em).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{k.resumo}</p>
              </div>
            ))}
          </div>
        )
      )}

      {aba === "propostas" && (filtradas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", opacity: 0.5 }}>
          <History size={40} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 15, margin: 0 }}>Nada no histórico ainda</p>
          <p style={{ fontSize: 13, margin: "4px 0 0" }}>Propostas aplicadas ou rejeitadas aparecem aqui</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {[...grupos].map(([grupo, itens]) => (
            <div key={grupo}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 8px" }}>
                {grupo !== "Geral" && <Database size={14} style={{ color: "#6366f1", flexShrink: 0 }} />}
                <span style={{ fontWeight: 600, fontSize: 14 }}>{grupo}</span>
                <span style={{ fontSize: 12, opacity: 0.45 }}>{itens.length} proposta{itens.length !== 1 ? "s" : ""}</span>
              </div>

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
                            {new Date(p.atualizado_em).toLocaleString("pt-BR")}
                            {p.aprovado_por_nome && ` · por ${p.aprovado_por_nome}`}
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
                            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", opacity: 0.5 }}>Correção</p>
                            <div style={{ padding: "12px 14px", borderRadius: 8, background: "#f8fafc", border: "1px solid var(--border, #e5e7eb)", fontSize: 13, whiteSpace: "pre-wrap" }}>
                              {p.correcao_proposta}
                            </div>
                          </div>
                          {p.sql_correcao && (
                            <div style={{ marginBottom: 16 }}>
                              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", opacity: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
                                <Code2 size={12} /> SQL {p.status === "aplicada" ? "aplicado" : "de correção"} {p.base_alvo && p.base_alvo !== "principal" ? `(base: ${p.base_alvo})` : ""}
                              </p>
                              <pre style={{ margin: 0, padding: "12px 14px", borderRadius: 8, background: "#0f172a", color: "#e2e8f0", fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap", border: "1px solid #334155" }}>
                                {p.sql_correcao}
                              </pre>
                            </div>
                          )}
                          {p.status === "aplicada" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#166534" }}>
                              <CheckCircle2 size={13} /> Aplicado em {p.aplicado_em ? new Date(p.aplicado_em).toLocaleString("pt-BR") : "-"}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
