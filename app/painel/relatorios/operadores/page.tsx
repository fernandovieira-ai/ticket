"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Operador {
  id: string;
  nome: string;
  perfil: string;
  total_tickets: number;
  total_clientes: number;
}

const PERFIL_COR: Record<string, string> = {
  admin:           "#6366F1",
  supervisor:      "#F59E0B",
  operador:        "#10B981",
  somente_leitura: "#94A3B8",
};

const PERFIL_LABEL: Record<string, string> = {
  admin:           "Admin",
  supervisor:      "Supervisor",
  operador:        "Operador",
  somente_leitura: "Somente leitura",
};

const PERIODOS = [
  { label: "Hoje",    dias: 0  },
  { label: "7 dias",  dias: 7  },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
  { label: "Tudo",    dias: -1 },
];

const STATUS_OPCOES = [
  { label: "Todos",        value: ""                  },
  { label: "Aberto",       value: "aberto"            },
  { label: "Em Andamento", value: "em_andamento"      },
  { label: "Aguardando",   value: "aguardando_cliente"},
  { label: "Finalizado",   value: "finalizado"        },
  { label: "Cancelado",    value: "cancelado"         },
];

const STATUS_COR: Record<string, string> = {
  "":                  "#6366F1",
  aberto:              "#3B82F6",
  em_andamento:        "#F59E0B",
  aguardando_cliente:  "#8B5CF6",
  finalizado:          "#10B981",
  cancelado:           "#EF4444",
};

function isoInicio(dias: number) {
  if (dias === -1) return "";
  const d = new Date();
  if (dias === 0) d.setHours(0, 0, 0, 0);
  else { d.setDate(d.getDate() - dias); d.setHours(0, 0, 0, 0); }
  return d.toISOString();
}
function isoFim() { return new Date().toISOString(); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: Operador = payload[0].payload;
  return (
    <div style={{
      background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8,
      padding: "10px 12px", fontSize: 12, lineHeight: 1.6,
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    }}>
      <p style={{ fontWeight: 600, color: "#18181B", marginBottom: 4 }}>{d.nome}</p>
      <p style={{ color: "#71717A" }}>
        Perfil: <span style={{ color: "#3F3F46", fontWeight: 500 }}>{PERFIL_LABEL[d.perfil] ?? d.perfil}</span>
      </p>
      <p style={{ color: "#71717A" }}>
        Tickets: <span style={{ color: "#3F3F46", fontWeight: 500 }}>{d.total_tickets}</span>
      </p>
      <p style={{ color: "#71717A" }}>
        Clientes únicos: <span style={{ color: "#6366F1", fontWeight: 600 }}>{d.total_clientes}</span>
      </p>
    </div>
  );
}

export default function OperadoresPage() {
  const [dados, setDados]   = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState(30);
  const [status, setStatus]   = useState("");

  const carregar = useCallback(async (dias: number, st: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const ini = isoInicio(dias);
      if (ini) { params.set("inicio", ini); params.set("fim", isoFim()); }
      if (st)  params.set("status", st);
      const res = await fetch(`/api/relatorios/operadores?${params}`);
      if (!res.ok) throw new Error("Falha ao carregar dados");
      setDados(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(periodo, status); }, [carregar, periodo, status]);

  const totalTickets  = dados.reduce((s, d) => s + d.total_tickets, 0);
  const totalClientes = dados.reduce((s, d) => s + d.total_clientes, 0);
  const dadosComCor   = dados.map((d) => ({ ...d, fill: PERFIL_COR[d.perfil] ?? "#6366F1" }));
  const chartHeight   = Math.max(dados.length * 44, 200);

  const corStatus = STATUS_COR[status] ?? "#6366F1";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-500" />
            Atendimento por Operador
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Tickets atribuídos por operador (excluindo clientes)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => carregar(periodo, status)} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500">Status:</span>
          {STATUS_OPCOES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{
                backgroundColor: status === s.value ? (STATUS_COR[s.value] ?? "#6366F1") : "#fff",
                color:           status === s.value ? "#fff" : "#52525B",
                borderColor:     status === s.value ? (STATUS_COR[s.value] ?? "#6366F1") : "#E4E4E7",
                fontWeight:      status === s.value ? 600 : 400,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Operadores com tickets</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{dados.length}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Total de tickets atribuídos</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{totalTickets}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Clientes únicos atendidos</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{totalClientes}</p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-zinc-700 mb-5">Tickets por operador</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-zinc-300" />
          </div>
        ) : dados.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-zinc-400">
            <Users className="h-10 w-10 mb-3 text-zinc-200" />
            <p className="text-sm">Nenhum operador com ticket no período/status selecionado</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={dadosComCor} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F4F4F5" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 12, fill: "#374151" }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "#F9FAFB" }} content={<CustomTooltip />} />
              <Bar dataKey="total_tickets" fill={corStatus} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legenda de perfis */}
      {dados.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {Object.entries(PERFIL_LABEL)
            .filter(([key]) => dados.some((d) => d.perfil === key))
            .map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-zinc-600">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: PERFIL_COR[key] }} />
                {label}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
