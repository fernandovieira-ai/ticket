"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Save,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Cpu,
  FileText,
  ListFilter,
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MessageSquare,
  LayoutList,
  Clock,
  Zap,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface IAConfig {
  provedor: "claude" | "openai";
  modelo: string;
  openai_api_key?: string | null;
  openai_key_configurada?: boolean;
  max_tokens: number;
  prompt_sugestao: string | null;
  prompt_classificar: string | null;
  prompt_resumir: string | null;
  prompt_whatsapp_bot: string | null;
  limite_diario: number;
  ativo: boolean;
}

interface LogEntry {
  id: number;
  ticket_id: string | null;
  ticket_numero: string | null;
  usuario_nome: string | null;
  tipo: string;
  prompt_resumido: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  latencia_ms: number | null;
  confianca: number | null;
  usado: boolean;
  criado_em: string;
}

interface LogsResponse {
  data: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    total_hoje: number;
    tokens_hoje: number;
    custo_estimado: number;
  };
}

type Tab = "configuracao" | "prompts" | "logs";

const TIPO_LABELS: Record<string, string> = {
  sugestao_resposta: "Sugestão",
  classificacao: "Classificação",
  resumo: "Resumo",
  whatsapp_bot: "Bot WA",
};

const TIPO_COLORS: Record<string, string> = {
  sugestao_resposta: "bg-blue-100 text-blue-700",
  classificacao: "bg-purple-100 text-purple-700",
  resumo: "bg-green-100 text-green-700",
  whatsapp_bot: "bg-orange-100 text-orange-700",
};

// ─── Página principal ─────────────────────────────────────────────────────────

export default function IAConfigPage() {
  const [tab, setTab] = useState<Tab>("configuracao");

  // Config state
  const [config, setConfig] = useState<IAConfig>({
    provedor: "claude",
    modelo: "claude-sonnet-4-20250514",
    openai_api_key: null,
    max_tokens: 1024,
    prompt_sugestao: null,
    prompt_classificar: null,
    prompt_resumir: null,
    prompt_whatsapp_bot: null,
    limite_diario: 500,
    ativo: true,
  });
  const [mostrarApiKey, setMostrarApiKey] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsStats, setLogsStats] = useState<LogsResponse["stats"]>({
    total_hoje: 0,
    tokens_hoje: 0,
    custo_estimado: 0,
  });
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logFiltroTipo, setLogFiltroTipo] = useState("");
  const LOG_PAGE_SIZE = 15;

  // Carregar config
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ia/config");
        if (res.ok) setConfig(await res.json());
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, []);

  // Carregar logs
  const carregarLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams({
        page: String(logPage),
        pageSize: String(LOG_PAGE_SIZE),
        tipo: logFiltroTipo,
      });
      const res = await fetch(`/api/ia/logs?${params}`);
      if (res.ok) {
        const data: LogsResponse = await res.json();
        setLogs(data.data);
        setLogTotal(data.total);
        setLogsStats(data.stats);
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [logPage, logFiltroTipo]);

  useEffect(() => {
    if (tab === "logs") carregarLogs();
  }, [tab, carregarLogs]);

  async function salvarConfig() {
    setSalvando(true);
    try {
      const res = await fetch("/api/ia/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Configuração de IA salva com sucesso");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Erro ao salvar");
      }
    } finally {
      setSalvando(false);
    }
  }

  const totalPages = Math.ceil(logTotal / LOG_PAGE_SIZE);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Bot size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Integração de IA
            </h1>
            <p className="text-sm text-gray-500">
              Configure prompts e parâmetros do assistente Claude
            </p>
          </div>
        </div>

        <button
          onClick={() => setConfig((c) => ({ ...c, ativo: !c.ativo }))}
          className="flex items-center gap-2 text-sm font-medium"
        >
          {config.ativo ? (
            <>
              <ToggleRight size={28} className="text-purple-600" />
              <span className="text-purple-700">IA ativa</span>
            </>
          ) : (
            <>
              <ToggleLeft size={28} className="text-gray-400" />
              <span className="text-gray-500">IA inativa</span>
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(
          [
            {
              id: "configuracao",
              label: "Configuração",
              icon: <Cpu size={14} />,
            },
            { id: "prompts", label: "Prompts", icon: <FileText size={14} /> },
            { id: "logs", label: "Logs", icon: <Activity size={14} /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Aba: Configuração ── */}
      {tab === "configuracao" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          {loadingConfig ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Provedor */}
              <div className="space-y-2">
                <Label>Provedor de IA</Label>
                <div className="flex gap-3">
                  {(["claude", "openai"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          provedor: p,
                          modelo:
                            p === "openai"
                              ? "gpt-4o"
                              : "claude-sonnet-4-20250514",
                        }))
                      }
                      className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                        config.provedor === p
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <Bot size={16} />
                      {p === "claude" ? "Anthropic Claude" : "OpenAI / ChatGPT"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chave OpenAI (só aparece quando provedor = openai) */}
              {config.provedor === "openai" && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <KeyRound size={14} />
                    API Key OpenAI
                  </Label>
                  <div className="relative">
                    <Input
                      type={mostrarApiKey ? "text" : "password"}
                      value={config.openai_api_key ?? ""}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          openai_api_key: e.target.value || null,
                        }))
                      }
                      placeholder={
                        config.openai_key_configurada
                          ? "••••••••  (já configurada — deixe em branco para manter)"
                          : "sk-..."
                      }
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarApiKey((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {mostrarApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    A chave é armazenada de forma segura e nunca exibida após
                    salvar.
                  </p>
                </div>
              )}

              {/* Modelo e tokens */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input
                    value={config.modelo}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, modelo: e.target.value }))
                    }
                    placeholder={
                      config.provedor === "openai"
                        ? "gpt-4o"
                        : "claude-sonnet-4-20250514"
                    }
                  />
                  <p className="text-xs text-gray-400">
                    {config.provedor === "openai"
                      ? "Ex: gpt-4o, gpt-4o-mini, gpt-4-turbo"
                      : "Ex: claude-sonnet-4-20250514, claude-haiku-4-5-20251001"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Máx. tokens por resposta</Label>
                  <Input
                    type="number"
                    min={256}
                    max={4096}
                    value={config.max_tokens}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        max_tokens: parseInt(e.target.value) || 1024,
                      }))
                    }
                  />
                  <p className="text-xs text-gray-400">256 – 4096 tokens</p>
                </div>
              </div>

              {/* Limite diário */}
              <div className="space-y-2">
                <Label>Limite de chamadas por dia</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={10000}
                    className="w-36"
                    value={config.limite_diario}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        limite_diario: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                  <p className="text-sm text-gray-500">
                    Defina 0 para ilimitado. Inclui sugestões, classificações,
                    resumos e bot WhatsApp.
                  </p>
                </div>
              </div>

              {/* Funcionalidades disponíveis */}
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                <div className="px-4 py-3 bg-gray-50 rounded-t-lg">
                  <p className="text-sm font-medium text-gray-700">
                    Funcionalidades disponíveis
                  </p>
                </div>
                {[
                  {
                    icon: <Sparkles size={16} className="text-blue-500" />,
                    titulo: "Sugestão de resposta",
                    desc: "Gera rascunho de resposta no detalhe do ticket",
                    rota: "POST /api/ia/sugerir",
                  },
                  {
                    icon: <ListFilter size={16} className="text-purple-500" />,
                    titulo: "Classificação automática",
                    desc: "Sugere categoria e prioridade ao abrir ticket",
                    rota: "POST /api/ia/classificar",
                  },
                  {
                    icon: <LayoutList size={16} className="text-green-500" />,
                    titulo: "Resumo do ticket",
                    desc: "Gera briefing do histórico para o agente",
                    rota: "POST /api/ia/resumir",
                  },
                  {
                    icon: (
                      <MessageSquare size={16} className="text-orange-500" />
                    ),
                    titulo: "Bot WhatsApp",
                    desc: "Responde automaticamente no canal WhatsApp (config. em WhatsApp → IA)",
                    rota: "via webhook WA",
                  },
                ].map((f) => (
                  <div
                    key={f.titulo}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {f.icon}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {f.titulo}
                      </p>
                      <p className="text-xs text-gray-500">{f.desc}</p>
                    </div>
                    <code className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {f.rota}
                    </code>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={salvarConfig} disabled={salvando}>
                  {salvando ? (
                    <Loader2 size={14} className="animate-spin mr-2" />
                  ) : (
                    <Save size={14} className="mr-2" />
                  )}
                  Salvar configuração
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Aba: Prompts ── */}
      {tab === "prompts" && (
        <div className="space-y-4">
          {loadingConfig ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Deixe os campos em branco para usar o prompt padrão do sistema.
                Os prompts customizados substituem completamente o padrão.
              </div>

              {[
                {
                  key: "prompt_sugestao" as keyof IAConfig,
                  label: "Prompt — Sugestão de resposta",
                  placeholder:
                    "Descreva como a IA deve se comportar ao sugerir respostas...\nVariáveis disponíveis: já incluídas automaticamente no contexto (ticket, histórico, cliente).",
                },
                {
                  key: "prompt_classificar" as keyof IAConfig,
                  label: "Prompt — Classificação de ticket",
                  placeholder:
                    "Instruções para classificar categoria e prioridade.\nDeve retornar JSON: { categoria_id, prioridade_codigo, confianca }",
                },
                {
                  key: "prompt_resumir" as keyof IAConfig,
                  label: "Prompt — Resumo de ticket",
                  placeholder:
                    "Instruções para resumir o histórico do ticket em 3-5 linhas...",
                },
                {
                  key: "prompt_whatsapp_bot" as keyof IAConfig,
                  label: "Prompt — Bot WhatsApp",
                  placeholder:
                    "Instruções para o bot WhatsApp.\nDeve retornar JSON: { resposta, acao, confianca }",
                },
              ].map((p) => (
                <div
                  key={p.key}
                  className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
                >
                  <Label className="text-sm font-medium">{p.label}</Label>
                  <Textarea
                    rows={6}
                    value={(config[p.key] as string | null) ?? ""}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        [p.key]: e.target.value || null,
                      }))
                    }
                    placeholder={p.placeholder}
                    className="text-sm font-mono resize-y"
                  />
                </div>
              ))}

              <div className="flex justify-end">
                <Button onClick={salvarConfig} disabled={salvando}>
                  {salvando ? (
                    <Loader2 size={14} className="animate-spin mr-2" />
                  ) : (
                    <Save size={14} className="mr-2" />
                  )}
                  Salvar prompts
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Aba: Logs ── */}
      {tab === "logs" && (
        <div className="space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                icon: <Zap size={18} className="text-purple-500" />,
                label: "Chamadas hoje",
                value: logsStats.total_hoje.toLocaleString("pt-BR"),
                bg: "bg-purple-50",
              },
              {
                icon: <Cpu size={18} className="text-blue-500" />,
                label: "Tokens hoje",
                value: logsStats.tokens_hoje.toLocaleString("pt-BR"),
                bg: "bg-blue-50",
              },
              {
                icon: <Activity size={18} className="text-green-500" />,
                label: "Custo estimado (USD)",
                value: `$${logsStats.custo_estimado.toFixed(4)}`,
                bg: "bg-green-50",
              },
            ].map((s) => (
              <div
                key={s.label}
                className={`${s.bg} rounded-xl border border-gray-200 p-4 flex items-center gap-3`}
              >
                {s.icon}
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {s.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros + reload */}
          <div className="flex items-center gap-3">
            <select
              value={logFiltroTipo}
              onChange={(e) => {
                setLogFiltroTipo(e.target.value);
                setLogPage(1);
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">Todos os tipos</option>
              <option value="sugestao_resposta">Sugestão de resposta</option>
              <option value="classificacao">Classificação</option>
              <option value="resumo">Resumo</option>
              <option value="whatsapp_bot">Bot WhatsApp</option>
            </select>
            <button
              onClick={carregarLogs}
              disabled={loadingLogs}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
            >
              <RefreshCw
                size={15}
                className={loadingLogs ? "animate-spin" : ""}
              />
            </button>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loadingLogs ? (
              <div className="flex justify-center py-10">
                <Loader2 size={22} className="animate-spin text-gray-400" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Bot size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum log encontrado</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Tipo
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Ticket
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Usuário
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Prompt
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Tokens
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <Clock size={12} className="inline mr-1" />
                      ms
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Horário
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            TIPO_COLORS[log.tipo] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {TIPO_LABELS[log.tipo] ?? log.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {log.ticket_numero ? (
                          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                            {log.ticket_numero}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {log.usuario_nome ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                        {log.prompt_resumido ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs font-mono">
                        {log.tokens_entrada != null && log.tokens_saida != null
                          ? `${(log.tokens_entrada + log.tokens_saida).toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs font-mono">
                        {log.latencia_ms != null
                          ? log.latencia_ms.toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(log.criado_em).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  {logTotal} registros · página {logPage} de {totalPages}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                    disabled={logPage === 1}
                    className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() =>
                      setLogPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={logPage === totalPages}
                    className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
