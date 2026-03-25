"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  MessageCircle,
  BarChart2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Bot,
  Filter,
  Clock,
  Search,
  X,
  ArrowUpDown,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Grupo {
  id: string;
  nome: string;
  descricao: string | null;
  total_membros: number;
  monitorado: boolean;
  ativo: boolean;
  ultima_sincronizacao: string | null;
  instancia_nome: string | null;
  ultimo_atendimento: string | null;
  interacoes_abertas: number;
}

interface GrupoComStats extends Grupo {
  total_mensagens?: number;
  ultimo_sentimento?: string;
  ultima_analise?: string;
}

function tempoRelativo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "agora";
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

const SENTIMENTO_COR: Record<string, string> = {
  positivo: "text-green-600 bg-green-50 border-green-200",
  neutro:   "text-zinc-500 bg-zinc-50 border-zinc-200",
  negativo: "text-red-600 bg-red-50 border-red-200",
  misto:    "text-yellow-600 bg-yellow-50 border-yellow-200",
};

const SENTIMENTO_LABEL: Record<string, string> = {
  positivo: "Positivo",
  neutro:   "Neutro",
  negativo: "Negativo",
  misto:    "Misto",
};

type OrdemCampo = "nome" | "mensagens" | "membros" | "sem_resposta";
type Periodo = "hoje" | "7d";

function buildStatsParams(periodo: Periodo): string {
  if (periodo === "7d") return "";
  const ate   = new Date();
  const desde = new Date(ate);
  desde.setHours(0, 0, 0, 0);
  return `?desde=${desde.toISOString()}&ate=${ate.toISOString()}`;
}

export default function GruposWhatsappPage() {
  const [grupos, setGrupos] = useState<GrupoComStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState<string | null>(null);
  const [soComMensagens, setSoComMensagens] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [busca, setBusca] = useState("");
  const [filtroInstancia, setFiltroInstancia] = useState("");
  const [filtroSentimento, setFiltroSentimento] = useState("");
  const [ordem, setOrdem] = useState<OrdemCampo>("nome");

  const carregarGrupos = useCallback(async (
    filtroMensagens?: boolean,
    periodoOverride?: Periodo,
  ) => {
    setLoading(true);
    try {
      const usarFiltro  = filtroMensagens !== undefined ? filtroMensagens : soComMensagens;
      const usarPeriodo = periodoOverride ?? periodo;
      const params = usarFiltro ? "?com_mensagens=true" : "";
      const res = await fetch(`/api/whatsapp/grupos${params}`);
      if (!res.ok) throw new Error("Falha ao carregar grupos");
      const data: Grupo[] = await res.json();

      const statsParams = buildStatsParams(usarPeriodo);

      const comStats: GrupoComStats[] = await Promise.all(
        data.map(async (g) => {
          if (!g.monitorado) return g;
          try {
            const statsRes = await fetch(`/api/whatsapp/grupos/${g.id}/stats${statsParams}`);
            if (!statsRes.ok) return g;
            const stats = await statsRes.json();
            return {
              ...g,
              total_mensagens:  stats.totais.mensagens,
              ultimo_sentimento: stats.ultima_analise?.sentimento,
              ultima_analise:    stats.ultima_analise?.criado_em,
            };
          } catch {
            return g;
          }
        })
      );

      setGrupos(comStats);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar grupos");
    } finally {
      setLoading(false);
    }
  }, [soComMensagens, periodo]);

  useEffect(() => {
    carregarGrupos(true, "hoje");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trocarPeriodo(p: Periodo) {
    setPeriodo(p);
    carregarGrupos(undefined, p);
  }

  async function analisarGrupo(grupoId: string) {
    setAnalisando(grupoId);
    try {
      const ate   = new Date();
      const desde = new Date(ate.getTime() - 24 * 60 * 60 * 1000);
      const res = await fetch(`/api/whatsapp/grupos/${grupoId}/analisar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desde: desde.toISOString(), ate: ate.toISOString() }),
      });
      if (res.ok) {
        toast.success("Análise IA concluída! Atualizando dados...");
        await carregarGrupos();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Erro ao analisar grupo");
      }
    } finally {
      setAnalisando(null);
    }
  }

  // Instâncias únicas para o dropdown
  const instancias = useMemo(
    () => [...new Set(grupos.map((g) => g.instancia_nome).filter(Boolean) as string[])].sort(),
    [grupos]
  );

  // Aplica busca + filtros + ordenação
  const gruposFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return grupos
      .filter((g) => {
        if (termo && !g.nome.toLowerCase().includes(termo)) return false;
        if (filtroInstancia && g.instancia_nome !== filtroInstancia) return false;
        if (filtroSentimento && g.ultimo_sentimento !== filtroSentimento) return false;
        return true;
      })
      .sort((a, b) => {
        if (ordem === "mensagens")    return (b.total_mensagens ?? 0) - (a.total_mensagens ?? 0);
        if (ordem === "membros")      return (b.total_membros ?? 0) - (a.total_membros ?? 0);
        if (ordem === "sem_resposta") {
          // Sem atendimento algum → topo; depois mais antigo primeiro
          const ta = a.ultimo_atendimento ? new Date(a.ultimo_atendimento).getTime() : 0;
          const tb = b.ultimo_atendimento ? new Date(b.ultimo_atendimento).getTime() : 0;
          return ta - tb;
        }
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [grupos, busca, filtroInstancia, filtroSentimento, ordem]);

  const gruposMonitorados    = gruposFiltrados.filter((g) => g.monitorado);
  const gruposDesmonitorados = gruposFiltrados.filter((g) => !g.monitorado);
  const filtrosAtivos        = busca || filtroInstancia || filtroSentimento;
  const labelMsgs            = periodo === "hoje" ? "Msgs (hoje)" : "Msgs (7 dias)";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-green-600" />
            Grupos WhatsApp
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Monitore e analise mensagens dos seus grupos com IA
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Período */}
          <div className="flex items-center gap-1 border border-zinc-200 rounded-md overflow-hidden text-xs">
            <button
              onClick={() => trocarPeriodo("hoje")}
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
                periodo === "hoje"
                  ? "bg-green-600 text-white font-medium"
                  : "bg-white text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Hoje
            </button>
            <button
              onClick={() => trocarPeriodo("7d")}
              className={`px-3 py-1.5 transition-colors ${
                periodo === "7d"
                  ? "bg-green-600 text-white font-medium"
                  : "bg-white text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              7 dias
            </button>
          </div>

          <button
            onClick={() => {
              const novo = !soComMensagens;
              setSoComMensagens(novo);
              carregarGrupos(novo);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
              soComMensagens
                ? "bg-green-50 border-green-300 text-green-700"
                : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300"
            }`}
            title="Mostrar apenas grupos com mensagens salvas"
          >
            <Filter className="h-3.5 w-3.5" />
            Com mensagens
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => carregarGrupos()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Barra de busca e filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Busca por nome */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar grupo..."
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-zinc-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
          />
          {busca && (
            <button
              onClick={() => setBusca("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filtro por instância */}
        {instancias.length > 1 && (
          <select
            value={filtroInstancia}
            onChange={(e) => setFiltroInstancia(e.target.value)}
            className="text-sm border border-zinc-200 rounded-md px-2.5 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="">Todas instâncias</option>
            {instancias.map((inst) => (
              <option key={inst} value={inst}>{inst}</option>
            ))}
          </select>
        )}

        {/* Filtro por sentimento */}
        <select
          value={filtroSentimento}
          onChange={(e) => setFiltroSentimento(e.target.value)}
          className="text-sm border border-zinc-200 rounded-md px-2.5 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="">Todos sentimentos</option>
          <option value="positivo">Positivo</option>
          <option value="neutro">Neutro</option>
          <option value="misto">Misto</option>
          <option value="negativo">Negativo</option>
        </select>

        {/* Ordenação */}
        <div className="flex items-center gap-1 text-xs text-zinc-500 border border-zinc-200 rounded-md px-2.5 py-1.5 bg-white">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemCampo)}
            className="bg-transparent focus:outline-none text-zinc-700"
          >
            <option value="nome">Nome A–Z</option>
            <option value="mensagens">+ Mensagens</option>
            <option value="membros">+ Membros</option>
            <option value="sem_resposta">Sem resposta há mais tempo</option>
          </select>
        </div>

        {/* Limpar filtros */}
        {filtrosAtivos && (
          <button
            onClick={() => { setBusca(""); setFiltroInstancia(""); setFiltroSentimento(""); }}
            className="text-xs text-zinc-400 hover:text-zinc-600 underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Total de grupos</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{grupos.length}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Monitorados</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{gruposMonitorados.length}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">{labelMsgs}</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {gruposMonitorados.reduce((s, g) => s + (g.total_mensagens ?? 0), 0).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-zinc-300" />
        </div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-16 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl">
          <Users className="h-10 w-10 mx-auto text-zinc-200 mb-3" />
          <p className="text-sm font-medium text-zinc-500">Nenhum grupo sincronizado</p>
          <p className="text-xs text-zinc-400 mt-1">
            Vá em{" "}
            <Link href="/painel/configuracoes/whatsapp" className="text-green-600 underline">
              Config → WhatsApp
            </Link>{" "}
            para sincronizar seus grupos.
          </p>
        </div>
      ) : (
        <>
          {/* Grupos monitorados */}
          {gruposMonitorados.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Grupos monitorados ({gruposMonitorados.length})
              </h2>
              <div className="space-y-3">
                {gruposMonitorados.map((g) => (
                  <div
                    key={g.id}
                    className="bg-white border border-zinc-200 rounded-lg p-4 flex items-center gap-4 hover:border-zinc-300 transition-colors"
                  >
                    {/* Ícone */}
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-green-600" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-zinc-900 truncate">{g.nome}</p>
                        {g.interacoes_abertas > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-300 text-amber-700 font-medium">
                            {g.interacoes_abertas} em aberto
                          </span>
                        )}
                        {g.ultimo_sentimento && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded border ${SENTIMENTO_COR[g.ultimo_sentimento] ?? SENTIMENTO_COR.neutro}`}
                          >
                            {SENTIMENTO_LABEL[g.ultimo_sentimento] ?? g.ultimo_sentimento}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-400">
                        <span>{g.total_membros} membros</span>
                        {g.instancia_nome && <span>{g.instancia_nome}</span>}
                        {g.total_mensagens !== undefined && (
                          <span>{g.total_mensagens.toLocaleString("pt-BR")} msgs / {periodo === "hoje" ? "hoje" : "7 dias"}</span>
                        )}
                        {g.ultimo_atendimento ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Atendido {tempoRelativo(g.ultimo_atendimento)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-500">
                            <Clock className="h-3 w-3" />
                            Sem atendimento
                          </span>
                        )}
                        {g.ultima_analise && (
                          <span>
                            Analisado:{" "}
                            {new Date(g.ultima_analise).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => analisarGrupo(g.id)}
                        disabled={analisando === g.id}
                        className="gap-1.5 text-xs"
                        title="Analisar últimas 24h com IA"
                      >
                        {analisando === g.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Bot className="h-3.5 w-3.5" />
                        )}
                        Analisar
                      </Button>
                      <Link href={`/painel/whatsapp/grupos/${g.id}`}>
                        <Button size="sm" className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white">
                          <BarChart2 className="h-3.5 w-3.5" />
                          Gráficos
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Grupos não monitorados */}
          {gruposDesmonitorados.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-zinc-400" />
                Não monitorados ({gruposDesmonitorados.length})
              </h2>
              <div className="space-y-2">
                {gruposDesmonitorados.map((g) => (
                  <div
                    key={g.id}
                    className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 flex items-center gap-3 opacity-60"
                  >
                    <div className="h-8 w-8 rounded-full bg-zinc-200 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-700 truncate">{g.nome}</p>
                      <p className="text-xs text-zinc-400">{g.total_membros} membros</p>
                    </div>
                    <Link href="/painel/configuracoes/whatsapp">
                      <Button size="sm" variant="ghost" className="text-xs text-zinc-500">
                        Ativar monitoramento
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
