"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart2, RefreshCw, Loader2, Ticket, Clock, CheckCircle,
  AlertTriangle, MessageCircle, Timer, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Kpis {
  total: number;
  abertos: number;
  em_andamento: number;
  resolvidos_hoje: number;
  violacoes_sla: number;
  tempo_medio_h: number | null;
  tickets_whatsapp: number;
}

interface DiaRow      { data: string; total: number }
interface StatusRow   { codigo: string; nome: string; cor: string; total: number }
interface CanalRow    { canal: string; total: number }
interface CatRow      { nome: string; total: number }
interface ClienteRow  { nome: string; total: number }

interface Dados {
  kpis:          Kpis;
  por_dia:       DiaRow[];
  por_status:    StatusRow[];
  por_canal:     CanalRow[];
  por_categoria: CatRow[];
  top_clientes:  ClienteRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERIODOS = [
  { label: "Hoje",    dias: 0  },
  { label: "7 dias",  dias: 7  },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
  { label: "Tudo",    dias: -1 },
];

function isoInicio(dias: number) {
  if (dias === -1) return "";
  const d = new Date();
  if (dias === 0) d.setHours(0, 0, 0, 0);
  else { d.setDate(d.getDate() - dias); d.setHours(0, 0, 0, 0); }
  return d.toISOString();
}
function isoFim() { return new Date().toISOString(); }

function fmtData(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtHoras(h: number | null) {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${h}h`;
  return `${(h / 24).toFixed(1)}d`;
}

const CANAL_LABEL: Record<string, string> = {
  painel:    "Painel",
  portal:    "Portal",
  whatsapp:  "WhatsApp",
  email:     "E-mail",
};

// ─── Componente KPI Card ─────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  alert?: boolean;
}

function KpiCard({ label, value, icon, color, alert }: KpiCardProps) {
  return (
    <div
      className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-2"
      style={{ borderColor: alert ? "#FCA5A5" : undefined }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

// ─── Tooltip customizado para linha ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-semibold text-zinc-700 mb-1">{label}</p>
      <p className="text-zinc-500">Tickets: <span className="font-bold text-indigo-600">{payload[0].value}</span></p>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function VisaoGeralPage() {
  const [dados, setDados]     = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState(30);

  const carregar = useCallback(async (dias: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const ini = isoInicio(dias);
      if (ini) { params.set("inicio", ini); params.set("fim", isoFim()); }
      const res = await fetch(`/api/relatorios/visao-geral?${params}`);
      if (!res.ok) throw new Error("Falha ao carregar dados");
      setDados(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(periodo); }, [carregar, periodo]);

  const kpis = dados?.kpis;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-indigo-500" />
            Visão Geral
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Panorama completo dos chamados</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => carregar(periodo)} disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtro de período */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-500">Período:</span>
        {PERIODOS.map((p) => (
          <button
            key={p.dias}
            onClick={() => setPeriodo(p.dias)}
            className="text-xs px-3 py-1 rounded-full border transition-colors"
            style={{
              backgroundColor: periodo === p.dias ? "#6366F1" : "#fff",
              color:           periodo === p.dias ? "#fff"    : "#52525B",
              borderColor:     periodo === p.dias ? "#6366F1" : "#E4E4E7",
              fontWeight:      periodo === p.dias ? 600       : 400,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      {loading && !dados ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Total de Tickets"
              value={kpis?.total ?? 0}
              icon={<Ticket className="h-4 w-4 text-indigo-400" />}
              color="#6366F1"
            />
            <KpiCard
              label="Abertos"
              value={kpis?.abertos ?? 0}
              icon={<Clock className="h-4 w-4 text-blue-400" />}
              color="#3B82F6"
            />
            <KpiCard
              label="Em Andamento"
              value={kpis?.em_andamento ?? 0}
              icon={<TrendingUp className="h-4 w-4 text-amber-400" />}
              color="#F59E0B"
            />
            <KpiCard
              label="Resolvidos Hoje"
              value={kpis?.resolvidos_hoje ?? 0}
              icon={<CheckCircle className="h-4 w-4 text-green-400" />}
              color="#10B981"
            />
            <KpiCard
              label="Violações de SLA"
              value={kpis?.violacoes_sla ?? 0}
              icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
              color="#EF4444"
              alert={(kpis?.violacoes_sla ?? 0) > 0}
            />
            <KpiCard
              label="Tempo Médio (resolução)"
              value={fmtHoras(kpis?.tempo_medio_h ?? null)}
              icon={<Timer className="h-4 w-4 text-purple-400" />}
              color="#8B5CF6"
            />
            <KpiCard
              label="Via WhatsApp"
              value={kpis?.tickets_whatsapp ?? 0}
              icon={<MessageCircle className="h-4 w-4 text-emerald-400" />}
              color="#10B981"
            />
          </div>

          {/* Linha temporal */}
          {(dados?.por_dia?.length ?? 0) > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-zinc-700 mb-4">Tickets ao longo do tempo</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dados!.por_dia} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" />
                  <XAxis
                    dataKey="data"
                    tickFormatter={fmtData}
                    tick={{ fontSize: 10, fill: "#9CA3AF" }}
                    axisLine={false} tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<LineTooltip />} />
                  <Line
                    type="monotone" dataKey="total" stroke="#6366F1"
                    strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Status + Categorias */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Distribuição por status (donut) */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-zinc-700 mb-4">Por Status</p>
              {(dados?.por_status?.length ?? 0) === 0 ? (
                <p className="text-sm text-zinc-400 py-8 text-center">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={dados!.por_status}
                      dataKey="total"
                      nameKey="nome"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {dados!.por_status.map((s) => (
                        <Cell key={s.codigo} fill={s.cor} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [value, name]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E4E7" }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span style={{ fontSize: 11, color: "#52525B" }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Por categoria */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-zinc-700 mb-4">Por Categoria</p>
              {(dados?.por_categoria?.length ?? 0) === 0 ? (
                <p className="text-sm text-zinc-400 py-8 text-center">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(dados!.por_categoria.length * 34, 160)}>
                  <BarChart
                    data={dados!.por_categoria}
                    layout="vertical"
                    margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                    barSize={16}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F4F4F5" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "#F9FAFB" }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E4E7" }}
                    />
                    <Bar dataKey="total" fill="#6366F1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Canal + Top Clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Por canal */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-zinc-700 mb-4">Por Canal de Abertura</p>
              {(dados?.por_canal?.length ?? 0) === 0 ? (
                <p className="text-sm text-zinc-400 py-4 text-center">Sem dados</p>
              ) : (
                <div className="space-y-3">
                  {dados!.por_canal.map((c) => {
                    const total = dados!.por_canal.reduce((s, x) => s + x.total, 0);
                    const pct   = total > 0 ? Math.round((c.total / total) * 100) : 0;
                    const CORES: Record<string, string> = {
                      painel: "#6366F1", portal: "#3B82F6",
                      whatsapp: "#10B981", email: "#F59E0B",
                    };
                    const cor = CORES[c.canal] ?? "#94A3B8";
                    return (
                      <div key={c.canal}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-zinc-600 font-medium">{CANAL_LABEL[c.canal] ?? c.canal}</span>
                          <span className="text-zinc-500">{c.total} <span className="text-zinc-400">({pct}%)</span></span>
                        </div>
                        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top clientes */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-zinc-700 mb-4">Clientes com mais chamados</p>
              {(dados?.top_clientes?.length ?? 0) === 0 ? (
                <p className="text-sm text-zinc-400 py-4 text-center">Sem dados</p>
              ) : (
                <div className="space-y-2">
                  {dados!.top_clientes.map((c, i) => {
                    const max = dados!.top_clientes[0]?.total ?? 1;
                    const pct = Math.round((c.total / max) * 100);
                    return (
                      <div key={c.nome} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-4 text-right font-mono">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-zinc-700 font-medium truncate">{c.nome}</span>
                            <span className="text-zinc-500 ml-2 shrink-0">{c.total}</span>
                          </div>
                          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
