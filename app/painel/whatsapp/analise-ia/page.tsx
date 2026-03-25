"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  RefreshCw,
  Loader2,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Topico {
  titulo?: string;
  relevancia?: number;
  [key: string]: unknown;
}

interface Analise {
  id: string;
  grupo_id: string;
  grupo_nome: string;
  instancia_nome: string;
  periodo_inicio: string;
  periodo_fim: string;
  total_mensagens: number;
  total_participantes: number;
  resumo: string;
  sentimento: string;
  score_sentimento: number;
  topicos: (string | Topico)[] | null;
  alertas: (string | { descricao?: string; [key: string]: unknown })[] | null;
  criado_em: string;
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

export default function AnaliseIAPage() {
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/analises");
      if (!res.ok) throw new Error("Falha ao carregar análises");
      setAnalises(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar análises");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-green-600" />
            Análise IA
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Histórico de análises geradas pela IA em todos os grupos
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Total de análises</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{analises.length}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Grupos analisados</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {new Set(analises.map((a) => a.grupo_id)).size}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500">Com alertas</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {analises.filter((a) => Array.isArray(a.alertas) && a.alertas.length > 0).length}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-zinc-300" />
        </div>
      ) : analises.length === 0 ? (
        <div className="text-center py-16 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl">
          <Activity className="h-10 w-10 mx-auto text-zinc-200 mb-3" />
          <p className="text-sm font-medium text-zinc-500">Nenhuma análise encontrada</p>
          <p className="text-xs text-zinc-400 mt-1">
            Vá em{" "}
            <Link href="/painel/whatsapp/grupos" className="text-green-600 underline">
              Grupos
            </Link>{" "}
            e clique em Analisar em um grupo monitorado.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {analises.map((a) => (
            <div
              key={a.id}
              className="bg-white border border-zinc-200 rounded-lg p-4 space-y-2 hover:border-zinc-300 transition-colors"
            >
              {/* Cabeçalho */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-sm font-medium text-zinc-900 truncate">{a.grupo_nome}</span>
                  <span className="text-xs text-zinc-400">{a.instancia_nome}</span>
                  {a.sentimento && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${SENTIMENTO_COR[a.sentimento] ?? SENTIMENTO_COR.neutro}`}>
                      {SENTIMENTO_LABEL[a.sentimento] ?? a.sentimento}
                    </span>
                  )}
                  {Array.isArray(a.alertas) && a.alertas.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
                      <AlertTriangle className="h-3 w-3" />
                      {a.alertas.length} alerta{a.alertas.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-400">
                  <span>{a.total_mensagens} msgs</span>
                  <span>
                    {new Date(a.criado_em).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <Link href={`/painel/whatsapp/grupos/${a.grupo_id}`}>
                    <button className="flex items-center gap-0.5 text-green-600 hover:text-green-700">
                      Ver grupo
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </Link>
                </div>
              </div>

              {/* Resumo */}
              {a.resumo && (
                <p className="text-xs text-zinc-600 leading-relaxed line-clamp-2">{a.resumo}</p>
              )}

              {/* Tópicos */}
              {Array.isArray(a.topicos) && a.topicos.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {a.topicos.map((t, i) => {
                    const label = typeof t === "string" ? t : (t as Topico).titulo ?? JSON.stringify(t);
                    return (
                      <span key={i} className="text-xs px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full">
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Alertas */}
              {Array.isArray(a.alertas) && a.alertas.length > 0 && (
                <div className="space-y-1">
                  {a.alertas.map((alerta, i) => {
                    const label = typeof alerta === "string" ? alerta : (alerta as { descricao?: string }).descricao ?? JSON.stringify(alerta);
                    return (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 rounded px-2 py-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
