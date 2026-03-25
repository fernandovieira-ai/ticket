"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ArrowLeft,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Calendar,
  Timer,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ───────────────────────── TIPOS ─────────────────────────
interface TemposResposta {
  grupo: { id: string; nome: string; sla_resposta_min: number | null };
  periodo: { desde: string; ate: string };
  kpis: {
    total_interacoes:  number;
    respondidas:       number;
    sem_resposta:      number;
    media_min:         number | null;
    mediana_min:       number | null;
    mais_rapido_min:   number | null;
    mais_lento_min:    number | null;
    violacoes_sla:     number;
  };
  por_operador: {
    operador_id:     string;
    operador_nome:   string;
    respostas:       number;
    media_min:       number | null;
    mediana_min:     number | null;
    mais_rapido_min: number | null;
    dentro_sla:      number;
    pct_sla:         number | null;
  }[];
  por_faixa: { faixa: string; total: number }[];
  em_aberto: {
    id:             string;
    remetente_jid:  string;
    remetente_nome: string | null;
    msg_criada_em:  string;
    aguardando_min: number;
    acima_sla:      boolean;
  }[];
  por_hora: { hora: number; total: number; media_min: number | null }[];
}

// ───────────────────────── HELPERS ─────────────────────────
function toISOLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtMin(min: number | null) {
  if (min === null) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${min.toFixed(1)} min`;
  return `${(min / 60).toFixed(1)} h`;
}

const FAIXA_LABEL: Record<string, string> = {
  ate_1min:   "< 1 min",
  "1_5min":   "1–5 min",
  "5_15min":  "5–15 min",
  "15_30min": "15–30 min",
  "30_60min": "30–60 min",
  acima_1h:   "> 1 h",
};

const FAIXA_COR: Record<string, string> = {
  ate_1min:   "#22c55e",
  "1_5min":   "#84cc16",
  "5_15min":  "#f59e0b",
  "15_30min": "#f97316",
  "30_60min": "#ef4444",
  acima_1h:   "#7f1d1d",
};

// ───────────────────────── COMPONENTE ─────────────────────────
export default function AtendimentoGrupo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const hoje  = new Date();
  const set7d = new Date(hoje.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [desde, setDesde] = useState(toISOLocal(set7d));
  const [ate,   setAte]   = useState(toISOLocal(hoje));
  const [data,  setData]  = useState<TemposResposta | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/whatsapp/grupos/${id}/tempos-resposta?desde=${desde}T00:00:00&ate=${ate}T23:59:59`
      );
      if (!res.ok) throw new Error("Falha ao carregar dados");
      setData(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [id, desde, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  const pctRespondidas = data
    ? data.kpis.total_interacoes > 0
      ? Math.round((data.kpis.respondidas / data.kpis.total_interacoes) * 100)
      : 100
    : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/painel/whatsapp/grupos/${id}`}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-zinc-500">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              {data?.grupo.nome ?? "Carregando..."}
            </h1>
            <p className="text-sm text-zinc-500 flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              Controle de tempo de resposta
              {data?.grupo.sla_resposta_min && (
                <span className="ml-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">
                  SLA: {data.grupo.sla_resposta_min} min
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
            onClick={carregar}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
        </div>
      ) : data ? (
        <>
          {/* Alertas em aberto */}
          {data.em_aberto.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-amber-800">
                  {data.em_aberto.length} mensagem{data.em_aberto.length > 1 ? "s" : ""} aguardando resposta
                </span>
              </div>
              <div className="space-y-1.5">
                {data.em_aberto.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${
                      item.acima_sla
                        ? "bg-red-50 border border-red-200 text-red-800"
                        : "bg-white border border-amber-200 text-amber-800"
                    }`}
                  >
                    <span className="font-medium">
                      {item.remetente_nome ?? item.remetente_jid.split("@")[0]}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>Aguardando {fmtMin(item.aguardando_min)}</span>
                      {item.acima_sla && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          Acima do SLA
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              icon={<Users className="h-4 w-4 text-blue-600" />}
              label="Total interações"
              value={data.kpis.total_interacoes.toLocaleString("pt-BR")}
              sub={`${pctRespondidas}% respondidas`}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4 text-green-600" />}
              label="Tempo médio resp."
              value={fmtMin(data.kpis.media_min)}
              sub={`Mediana: ${fmtMin(data.kpis.mediana_min)}`}
            />
            <KpiCard
              icon={<TrendingDown className="h-4 w-4 text-purple-600" />}
              label="Mais rápido"
              value={fmtMin(data.kpis.mais_rapido_min)}
              sub={`Mais lento: ${fmtMin(data.kpis.mais_lento_min)}`}
            />
            <KpiCard
              icon={
                data.kpis.violacoes_sla > 0
                  ? <ShieldAlert className="h-4 w-4 text-red-500" />
                  : <CheckCircle2 className="h-4 w-4 text-green-500" />
              }
              label="Violações SLA"
              value={data.kpis.violacoes_sla.toString()}
              valueColor={data.kpis.violacoes_sla > 0 ? "#ef4444" : "#22c55e"}
              sub={data.grupo.sla_resposta_min ? `Prazo: ${data.grupo.sla_resposta_min} min` : "SLA não configurado"}
            />
          </div>

          {/* Ranking de operadores + Distribuição por faixa */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ranking operadores */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-700 mb-4 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-blue-600" />
                Ranking de operadores
              </h2>
              {data.por_operador.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-8">Nenhum operador respondeu no período</p>
              ) : (
                <div className="space-y-3">
                  {data.por_operador.map((op, i) => (
                    <div key={op.operador_id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-zinc-400 w-4 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium text-zinc-800 truncate">
                            {op.operador_nome}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-zinc-500">{op.respostas} resp.</span>
                            {op.pct_sla !== null && (
                              <Badge
                                className={`text-[10px] px-1.5 py-0 ${
                                  op.pct_sla >= 90
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : op.pct_sla >= 70
                                    ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                                    : "bg-red-100 text-red-700 border-red-200"
                                }`}
                              >
                                {op.pct_sla}% SLA
                              </Badge>
                            )}
                          </div>
                        </div>
                        {/* Barra de tempo médio (visual comparativo) */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-zinc-100 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-blue-500"
                              style={{
                                width: `${Math.min(
                                  100,
                                  data.por_operador[0].media_min
                                    ? ((op.media_min ?? 0) / data.por_operador[data.por_operador.length - 1].media_min!) * 100
                                    : 0
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-zinc-600 w-14 text-right">
                            {fmtMin(op.media_min)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Distribuição por faixa */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-700 mb-4 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-green-600" />
                Distribuição por tempo de resposta
              </h2>
              {data.por_faixa.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-8">Sem dados no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.por_faixa.map((f) => ({
                      faixa: FAIXA_LABEL[f.faixa] ?? f.faixa,
                      total: f.total,
                      cor:   FAIXA_COR[f.faixa] ?? "#94a3b8",
                      key:   f.faixa,
                    }))}
                    margin={{ bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="faixa" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Interações"]}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {data.por_faixa.map((f) => (
                        <Cell key={f.faixa} fill={FAIXA_COR[f.faixa] ?? "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Heatmap por hora */}
          {data.por_hora.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-700 mb-4 flex items-center gap-1.5">
                <Timer className="h-4 w-4 text-purple-600" />
                Tempo médio de resposta por hora do dia
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.por_hora} margin={{ bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="hora"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(h) => `${String(h).padStart(2, "0")}h`}
                  />
                  <YAxis tick={{ fontSize: 11 }} unit=" min" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    labelFormatter={(h) => `${String(h).padStart(2, "0")}:00 – ${String(Number(h) + 1).padStart(2, "0")}:00`}
                    formatter={(v, name) =>
                      name === "media_min"
                        ? [`${Number(v).toFixed(1)} min`, "Média de resposta"]
                        : [Number(v).toLocaleString("pt-BR"), "Interações"]
                    }
                  />
                  <Bar dataKey="media_min" name="media_min" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
  sub,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-zinc-900" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}
