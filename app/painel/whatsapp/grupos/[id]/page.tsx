"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ArrowLeft,
  Bot,
  Users,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Calendar,
  Smile,
  Meh,
  Frown,
  Activity,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ───────────────────────── TIPOS ─────────────────────────
interface Stats {
  grupo: { id: string; nome: string; total_membros: number };
  periodo: { desde: string; ate: string };
  totais: { mensagens: number; participantes: number };
  por_dia: { dia: string; total: number }[];
  por_tipo: { tipo: string; total: number }[];
  top_participantes: { jid: string; nome: string | null; total: number }[];
  ultima_analise: {
    id: string;
    resumo: string;
    sentimento: string;
    score_sentimento: number;
    topicos: { titulo: string; relevancia: number }[];
    alertas: { tipo: string; descricao: string }[];
    total_mensagens: number;
    criado_em: string;
  } | null;
  historico_sentimento: {
    periodo_inicio: string;
    periodo_fim: string;
    sentimento: string;
    score_sentimento: number;
    total_mensagens: number;
  }[];
}

// ───────────────────────── CORES ─────────────────────────
const TIPO_CORES: Record<string, string> = {
  texto:     "#22c55e",
  imagem:    "#3b82f6",
  audio:     "#f59e0b",
  video:     "#8b5cf6",
  documento: "#ec4899",
  sticker:   "#06b6d4",
};

const TIPO_LABEL: Record<string, string> = {
  texto:     "Texto",
  imagem:    "Imagem",
  audio:     "Áudio",
  video:     "Vídeo",
  documento: "Documento",
  sticker:   "Sticker",
};

const SENTIMENTO_CONFIG: Record<string, { label: string; cor: string; Icon: React.ElementType }> = {
  positivo: { label: "Positivo", cor: "#22c55e", Icon: Smile },
  neutro:   { label: "Neutro",   cor: "#94a3b8", Icon: Meh },
  negativo: { label: "Negativo", cor: "#ef4444", Icon: Frown },
  misto:    { label: "Misto",    cor: "#f59e0b", Icon: Activity },
};

// ───────────────────────── HELPERS ─────────────────────────
function formatDia(dia: string) {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

function toISOLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ───────────────────────── COMPONENTE ─────────────────────────
export default function GrupoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const hoje  = new Date();
  const set7d = new Date(hoje.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [desde, setDesde] = useState(toISOLocal(set7d));
  const [ate,   setAte]   = useState(toISOLocal(hoje));
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [analisando, setAnalisando] = useState(false);

  const carregarStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/whatsapp/grupos/${id}/stats?desde=${desde}&ate=${ate}T23:59:59`
      );
      if (!res.ok) throw new Error("Falha ao carregar dados");
      setStats(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar stats");
    } finally {
      setLoading(false);
    }
  }, [id, desde, ate]);

  useEffect(() => {
    carregarStats();
  }, [carregarStats]);

  async function rodarAnalise() {
    setAnalisando(true);
    try {
      const res = await fetch(`/api/whatsapp/grupos/${id}/analisar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desde: `${desde}T00:00:00`,
          ate:   `${ate}T23:59:59`,
        }),
      });
      if (res.ok) {
        toast.success("Análise IA concluída!");
        await carregarStats();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Erro na análise IA");
      }
    } finally {
      setAnalisando(false);
    }
  }

  const sentConfig = stats?.ultima_analise
    ? (SENTIMENTO_CONFIG[stats.ultima_analise.sentimento] ?? SENTIMENTO_CONFIG.neutro)
    : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/painel/whatsapp/grupos">
            <Button variant="ghost" size="sm" className="gap-1.5 text-zinc-500">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              {stats?.grupo.nome ?? "Carregando..."}
            </h1>
            <p className="text-sm text-zinc-500">
              {stats?.grupo.total_membros} membros · Análise de mensagens
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de período */}
          <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <input
              type="date"
              value={desde}
              max={ate}
              onChange={(e) => setDesde(e.target.value)}
              className="text-xs text-zinc-700 bg-transparent outline-none"
            />
            <span className="text-zinc-400 text-xs">até</span>
            <input
              type="date"
              value={ate}
              min={desde}
              max={toISOLocal(hoje)}
              onChange={(e) => setAte(e.target.value)}
              className="text-xs text-zinc-700 bg-transparent outline-none"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={carregarStats}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>

          <Link href={`/painel/whatsapp/grupos/${id}/atendimento`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              Atendimento
            </Button>
          </Link>

          <Button
            size="sm"
            onClick={rodarAnalise}
            disabled={analisando || loading}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            {analisando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
            Analisar com IA
          </Button>
        </div>
      </div>

      {loading && !stats ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
        </div>
      ) : stats ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              icon={<MessageSquare className="h-4 w-4 text-green-600" />}
              label="Mensagens no período"
              value={stats.totais.mensagens.toLocaleString("pt-BR")}
            />
            <KpiCard
              icon={<Users className="h-4 w-4 text-blue-600" />}
              label="Participantes ativos"
              value={stats.totais.participantes.toString()}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4 text-purple-600" />}
              label="Méd. msgs/dia"
              value={
                stats.por_dia.length > 0
                  ? Math.round(
                      stats.por_dia.reduce((s, d) => s + d.total, 0) / stats.por_dia.length
                    ).toLocaleString("pt-BR")
                  : "0"
              }
            />
            <KpiCard
              icon={
                sentConfig ? (
                  <sentConfig.Icon className="h-4 w-4" style={{ color: sentConfig.cor }} />
                ) : (
                  <Meh className="h-4 w-4 text-zinc-400" />
                )
              }
              label="Último sentimento"
              value={sentConfig?.label ?? "—"}
              valueStyle={sentConfig ? { color: sentConfig.cor } : undefined}
            />
          </div>

          {/* Gráfico: Mensagens por dia */}
          <ChartCard title="Mensagens por dia" icon={<TrendingUp className="h-4 w-4 text-green-600" />}>
            {stats.por_dia.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.por_dia.map((d) => ({ ...d, dia: formatDia(d.dia) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Mensagens"]}
                  />
                  <Bar dataKey="total" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Gráfico: Tipos + Top participantes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pizza tipos */}
            <ChartCard title="Tipos de mensagem" icon={<MessageSquare className="h-4 w-4 text-blue-600" />}>
              {stats.por_tipo.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={stats.por_tipo}
                      dataKey="total"
                      nameKey="tipo"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(props) => {
                        const p    = props as unknown as Record<string, unknown>;
                        const tipo = p.tipo as string | undefined;
                        const pct  = p.percent as number | undefined;
                        return `${TIPO_LABEL[tipo ?? ""] ?? tipo ?? ""} ${((pct ?? 0) * 100).toFixed(0)}%`;
                      }}
                      labelLine={false}
                    >
                      {stats.por_tipo.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={TIPO_CORES[entry.tipo] ?? "#94a3b8"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(v, name) => [
                        Number(v).toLocaleString("pt-BR"),
                        TIPO_LABEL[String(name)] ?? String(name),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Top participantes */}
            <ChartCard title="Top participantes" icon={<Users className="h-4 w-4 text-purple-600" />}>
              {stats.top_participantes.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    layout="vertical"
                    data={stats.top_participantes.slice(0, 8).map((p) => ({
                      nome: p.nome ?? p.jid.split("@")[0],
                      total: p.total,
                    }))}
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Msgs"]}
                    />
                    <Bar dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Gráfico: Score de sentimento ao longo do tempo */}
          {stats.historico_sentimento.length > 1 && (
            <ChartCard
              title="Evolução do sentimento (histórico de análises)"
              icon={<Activity className="h-4 w-4 text-yellow-500" />}
            >
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={stats.historico_sentimento.map((h) => ({
                    data: new Date(h.periodo_fim).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    }),
                    score: Number(Number(h.score_sentimento).toFixed(2)),
                    msgs: h.total_mensagens,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                  <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} tickFormatter={(v) => v.toFixed(1)} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    formatter={(v, name) => {
                      const n = String(name);
                      const num = Number(v);
                      return [
                        n === "score" ? num.toFixed(2) : num.toLocaleString("pt-BR"),
                        n === "score" ? "Score sentimento" : "Total msgs",
                      ];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Análise IA */}
          {stats.ultima_analise && (
            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
                  <Bot className="h-4 w-4 text-green-600" />
                  Última análise IA
                </h2>
                <span className="text-xs text-zinc-400">
                  {new Date(stats.ultima_analise.criado_em).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {/* Sentimento */}
              {sentConfig && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{
                    backgroundColor: sentConfig.cor + "15",
                    color: sentConfig.cor,
                    border: `1px solid ${sentConfig.cor}30`,
                  }}
                >
                  <sentConfig.Icon className="h-4 w-4" />
                  {sentConfig.label} · Score:{" "}
                  {Number(stats.ultima_analise.score_sentimento) > 0 ? "+" : ""}
                  {Number(stats.ultima_analise.score_sentimento).toFixed(2)}
                </div>
              )}

              {/* Resumo */}
              <p className="text-sm text-zinc-700 leading-relaxed">
                {stats.ultima_analise.resumo}
              </p>

              {/* Tópicos */}
              {stats.ultima_analise.topicos?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                    Tópicos identificados
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stats.ultima_analise.topicos.map((t, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {t.titulo}
                        <span className="ml-1 opacity-60">
                          {(Number(t.relevancia) * 100).toFixed(0)}%
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Alertas */}
              {stats.ultima_analise.alertas?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                    Alertas
                  </p>
                  <div className="space-y-2">
                    {stats.ultima_analise.alertas.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium capitalize">
                            {a.tipo.replace(/_/g, " ")}:{" "}
                          </span>
                          {a.descricao}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ───────────────────────── SUB-COMPONENTES ─────────────────────────
function KpiCard({
  icon,
  label,
  value,
  valueStyle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-zinc-900" style={valueStyle}>
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-700 mb-4 flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[220px] text-zinc-300">
      <p className="text-sm">Sem dados no período</p>
    </div>
  );
}
