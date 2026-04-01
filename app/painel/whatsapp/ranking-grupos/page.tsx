"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  Building2,
  User,
  ShieldCheck,
} from "lucide-react";
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

interface Remetente {
  remetente_jid: string;
  remetente_nome: string | null;
  numero: string;
  total_mensagens: number;
  total_grupos: number;
  usuario_id: string | null;
  usuario_nome: string | null;
  usuario_perfil: string | null;
  instancia_nome: string | null;
  eh_instancia: boolean;
}

const PERIODOS = [
  { label: "Hoje", dias: 0 },
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
];

const PERFIL_LABEL: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  operador: "Operador",
  somente_leitura: "Somente leitura",
};

type FiltroTipo = "todos" | "operador" | "instancia" | "externo";

const FILTROS_TIPO: { label: string; value: FiltroTipo }[] = [
  { label: "Todos", value: "todos" },
  { label: "Operador", value: "operador" },
  { label: "Instância", value: "instancia" },
  { label: "Externo", value: "externo" },
];

function isoInicio(dias: number) {
  const d = new Date();
  if (dias === 0) d.setHours(0, 0, 0, 0);
  else {
    d.setDate(d.getDate() - dias);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}
function isoFim() {
  return new Date().toISOString();
}

function nomeCurto(r: Remetente): string {
  if (r.instancia_nome) return `${r.instancia_nome} (instância)`;
  if (r.usuario_nome) return r.usuario_nome;
  if (r.remetente_nome) return r.remetente_nome;
  return r.numero;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: Remetente = payload[0].payload;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12,
        lineHeight: 1.7,
        boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
        minWidth: 200,
      }}
    >
      <p style={{ fontWeight: 600, color: "#18181B", marginBottom: 4 }}>
        {nomeCurto(d)}
      </p>
      <p style={{ color: "#71717A" }}>
        Número:{" "}
        <span style={{ color: "#3F3F46", fontWeight: 500 }}>+{d.numero}</span>
      </p>
      {d.usuario_nome && (
        <p style={{ color: "#71717A" }}>
          Operador:{" "}
          <span style={{ color: "#6366F1", fontWeight: 600 }}>
            {d.usuario_nome}
          </span>
          {d.usuario_perfil && (
            <span style={{ color: "#9CA3AF" }}>
              {" "}
              ({PERFIL_LABEL[d.usuario_perfil] ?? d.usuario_perfil})
            </span>
          )}
        </p>
      )}
      <p style={{ color: "#71717A" }}>
        Mensagens:{" "}
        <span style={{ color: "#3F3F46", fontWeight: 600 }}>
          {d.total_mensagens}
        </span>
      </p>
      <p style={{ color: "#71717A" }}>
        Grupos:{" "}
        <span style={{ color: "#3F3F46", fontWeight: 500 }}>
          {d.total_grupos}
        </span>
      </p>
      {d.instancia_nome && (
        <p style={{ color: "#6366F1", fontWeight: 500 }}>
          Instância do sistema
        </p>
      )}
    </div>
  );
}

function iconeRemetente(d: Remetente) {
  if (d.eh_instancia) return <Building2 className="h-4 w-4 text-indigo-500" />;
  if (d.usuario_id) return <ShieldCheck className="h-4 w-4 text-indigo-500" />;
  return <User className="h-4 w-4 text-green-600" />;
}

function corBadge(d: Remetente): string {
  if (d.eh_instancia) return "#EEF2FF";
  if (d.usuario_id) return "#EEF2FF";
  return "#F0FDF4";
}

export default function RankingGruposPage() {
  const [dados, setDados] = useState<Remetente[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState(7);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");

  const carregar = useCallback(async (dias: number, tipo: FiltroTipo) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        inicio: isoInicio(dias),
        fim: isoFim(),
        tipo,
      });
      const res = await fetch(`/api/whatsapp/grupos/ranking?${params}`);
      if (!res.ok) throw new Error("Falha ao carregar dados");
      setDados(await res.json());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao carregar dados",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar(periodo, filtroTipo);
  }, [carregar, periodo, filtroTipo]);

  // Quando tipo=todos a API retorna tudo; calculamos operadores localmente para o aviso e KPI.
  // Nos demais tipos a API já filtra, portanto dados === dadosFiltrados.
  const operadores =
    filtroTipo === "todos"
      ? dados.filter((d) => !!d.usuario_id && !d.eh_instancia)
      : filtroTipo === "operador"
        ? dados
        : [];

  const dadosFiltrados = dados;

  const chartData = dadosFiltrados.map((d) => ({
    ...d,
    nome_exibicao: nomeCurto(d).slice(0, 24),
  }));
  const chartHeight = Math.max(dadosFiltrados.length * 44, 200);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-600" />
            Ranking de Participantes nos Grupos
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Quem mais enviou mensagens — vinculado ao usuário pelo telefone
            WhatsApp
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => carregar(periodo, filtroTipo)}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
      </div>

      {/* Aviso se nenhum usuário vinculado */}
      {!loading && dados.length > 0 && operadores.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 space-y-1">
          <p>
            Nenhum operador identificado. Copie o <strong>JID</strong> do
            participante na tabela abaixo e cole no campo{" "}
            <strong>WhatsApp JID</strong> de cada usuário em{" "}
            <a
              href="/painel/configuracoes/usuarios"
              className="underline font-medium"
            >
              Configurações → Usuários
            </a>
            .
          </p>
          <p className="text-xs text-amber-600">
            Exemplo de JID:{" "}
            <code className="bg-amber-100 px-1 rounded">
              263689584308313@lid
            </code>{" "}
            ou{" "}
            <code className="bg-amber-100 px-1 rounded">
              5511999990000@s.whatsapp.net
            </code>
          </p>
        </div>
      )}

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
                backgroundColor: periodo === p.dias ? "#16A34A" : "#fff",
                color: periodo === p.dias ? "#fff" : "#52525B",
                borderColor: periodo === p.dias ? "#16A34A" : "#E4E4E7",
                fontWeight: periodo === p.dias ? 600 : 400,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Tipo:</span>
          {FILTROS_TIPO.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltroTipo(f.value)}
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{
                backgroundColor: filtroTipo === f.value ? "#6366F1" : "#fff",
                color: filtroTipo === f.value ? "#fff" : "#52525B",
                borderColor: filtroTipo === f.value ? "#6366F1" : "#E4E4E7",
                fontWeight: filtroTipo === f.value ? 600 : 400,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Participantes únicos</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {dadosFiltrados.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Total de mensagens</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {dadosFiltrados.reduce((s, d) => s + d.total_mensagens, 0)}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Operadores identificados</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">
            {operadores.length}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-zinc-700 mb-1">
          Mensagens por participante
        </p>
        <p className="text-xs text-zinc-400 mb-5">
          <span className="text-indigo-500 font-medium">Roxo</span> =
          operador/instância do sistema &nbsp;·&nbsp;
          <span className="text-green-600 font-medium">Verde</span> = externo
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-zinc-300" />
          </div>
        ) : dadosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-zinc-400">
            <TrendingUp className="h-10 w-10 mb-3 text-zinc-200" />
            <p className="text-sm">Nenhuma mensagem encontrada no período</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 50, left: 0, bottom: 0 }}
              barSize={20}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="#F4F4F5"
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nome_exibicao"
                width={160}
                tick={{ fontSize: 12, fill: "#374151" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "#F9FAFB" }}
                content={<CustomTooltip />}
              />
              <Bar dataKey="total_mensagens" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tabela detalhada */}
      {dadosFiltrados.length > 0 && !loading && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100">
            <p className="text-sm font-semibold text-zinc-700">Detalhamento</p>
          </div>
          <div className="divide-y divide-zinc-100">
            {dadosFiltrados.map((d, i) => (
              <div
                key={d.remetente_jid}
                className="flex items-center gap-3 px-5 py-3"
              >
                <span className="text-xs font-bold text-zinc-400 w-5 text-right shrink-0">
                  {i + 1}
                </span>
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor: corBadge(d),
                  }}
                >
                  {iconeRemetente(d)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">
                    {nomeCurto(d)}
                  </p>
                  <div className="flex items-center gap-2">
                    <p
                      className="text-xs text-zinc-400 font-mono cursor-pointer select-all"
                      title="Clique para selecionar e copiar o JID"
                    >
                      {d.remetente_jid}
                    </p>
                    {d.usuario_id && !d.eh_instancia && (
                      <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-medium">
                        {PERFIL_LABEL[d.usuario_perfil ?? ""] ??
                          d.usuario_perfil}
                      </span>
                    )}
                    {d.eh_instancia && (
                      <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-medium">
                        instância
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-xs text-zinc-400">Grupos</p>
                  <p className="text-sm font-semibold text-zinc-700">
                    {d.total_grupos}
                  </p>
                </div>
                <div className="text-right shrink-0 w-20">
                  <p className="text-xs text-zinc-400">Mensagens</p>
                  <p
                    className="text-sm font-bold"
                    style={{
                      color:
                        d.usuario_id || d.eh_instancia ? "#6366F1" : "#16A34A",
                    }}
                  >
                    {d.total_mensagens}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-zinc-100 flex flex-wrap gap-5">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
              Operador interno (vinculado por telefone)
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Building2 className="h-3.5 w-3.5 text-indigo-500" />
              Instância do sistema
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <User className="h-3.5 w-3.5 text-green-600" />
              Externo / não identificado
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
