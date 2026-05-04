"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Zap,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface QABase {
  id: string;
  categoria: string;
  pergunta_exemplo: string;
  resposta_template: string;
  tags: string[];
  aprovado: boolean;
  ativo: boolean;
  usos_total: number;
  acertos: number;
  erros: number;
  score_confianca: number | null;
  versao: number;
  embedding_gerado_at: string | null;
  criado_at: string;
}

interface QAPendente {
  id: string;
  categoria_sugerida: string | null;
  pergunta_original: string;
  resposta_original: string;
  grupo_id: string;
  confianca_extracao: string;
  status: string;
  criado_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(data: string) {
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-zinc-400 text-xs">—</span>;
  const cor =
    score >= 0.7
      ? "text-green-700 bg-green-50 border-green-200"
      : score >= 0.4
        ? "text-yellow-700 bg-yellow-50 border-yellow-200"
        : "text-red-700 bg-red-50 border-red-200";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-medium ${cor}`}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = "base" | "pendentes" | "novo";

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function BaseConhecimentoPage() {
  const [tab, setTab] = useState<Tab>("base");
  const [qaBase, setQaBase] = useState<QABase[]>([]);
  const [pendentes, setPendentes] = useState<QAPendente[]>([]);
  const [loadingBase, setLoadingBase] = useState(false);
  const [loadingPend, setLoadingPend] = useState(false);
  const [gerandoEmb, setGerandoEmb] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  // Novo Q&A form
  const [novoCategoria, setNovoCategoria] = useState("");
  const [novoPergunta, setNovoPergunta] = useState("");
  const [novoResposta, setNovoResposta] = useState("");
  const [novoAprovado, setNovoAprovado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchBase = useCallback(async () => {
    setLoadingBase(true);
    try {
      const r = await fetch("/api/whatsapp/qa-base");
      if (!r.ok) throw new Error("Falha ao carregar base");
      setQaBase(await r.json());
    } catch {
      toast.error("Erro ao carregar base de conhecimento");
    } finally {
      setLoadingBase(false);
    }
  }, []);

  const fetchPendentes = useCallback(async () => {
    setLoadingPend(true);
    try {
      const r = await fetch("/api/whatsapp/qa-pendentes?status=pendente");
      if (!r.ok) throw new Error("Falha ao carregar pendentes");
      setPendentes(await r.json());
    } catch {
      toast.error("Erro ao carregar fila de aprovação");
    } finally {
      setLoadingPend(false);
    }
  }, []);

  useEffect(() => {
    fetchBase();
    fetchPendentes();
  }, [fetchBase, fetchPendentes]);

  // ---------------------------------------------------------------------------
  // Ações
  // ---------------------------------------------------------------------------

  async function gerarEmbeddings() {
    setGerandoEmb(true);
    try {
      const r = await fetch("/api/whatsapp/qa-base/gerar-embeddings", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro");
      toast.success(`${data.atualizados} embedding(s) gerado(s). Total: ${data.total_com_embedding}`);
      fetchBase();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar embeddings");
    } finally {
      setGerandoEmb(false);
    }
  }

  async function aprovar(id: string) {
    const r = await fetch(`/api/whatsapp/qa-pendentes/${id}/aprovar`, { method: "POST" });
    const data = await r.json();
    if (!r.ok) { toast.error(data.error ?? "Erro ao aprovar"); return; }
    toast.success(`Aprovado! ${data.embedding_gerado ? "Embedding gerado." : "Gere o embedding depois."}`);
    fetchPendentes();
    fetchBase();
  }

  async function rejeitar(id: string) {
    const motivo = window.prompt("Motivo da rejeição (opcional):");
    if (motivo === null) return; // cancelou
    const r = await fetch(`/api/whatsapp/qa-pendentes/${id}/rejeitar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    const data = await r.json();
    if (!r.ok) { toast.error(data.error ?? "Erro ao rejeitar"); return; }
    toast.success("Rejeitado");
    fetchPendentes();
  }

  async function desativar(id: string) {
    if (!confirm("Desativar este Q&A?")) return;
    const r = await fetch(`/api/whatsapp/qa-base/${id}`, {
      method: "DELETE",
    });
    const data = await r.json();
    if (!r.ok) { toast.error(data.error ?? "Erro ao desativar"); return; }
    toast.success("Q&A desativado");
    fetchBase();
  }

  async function salvarNovo() {
    if (!novoCategoria.trim() || !novoPergunta.trim() || !novoResposta.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/whatsapp/qa-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria: novoCategoria,
          pergunta_exemplo: novoPergunta,
          resposta_template: novoResposta,
          aprovado: novoAprovado,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro");
      toast.success(`Q&A criado${data.aprovado ? " e aprovado" : " (aguardando aprovação)"}. ID: ${data.id}`);
      setNovoCategoria(""); setNovoPergunta(""); setNovoResposta(""); setNovoAprovado(false);
      fetchBase();
      setTab("base");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const semEmbedding = qaBase.filter((q) => q.aprovado && !q.embedding_gerado_at).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-blue-600" />
          <h1 className="text-lg font-semibold text-zinc-800">Base de Conhecimento</h1>
          {semEmbedding > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full border border-yellow-200">
              {semEmbedding} sem embedding
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { fetchBase(); fetchPendentes(); }}
            disabled={loadingBase || loadingPend}
          >
            <RefreshCw size={14} className={loadingBase || loadingPend ? "animate-spin" : ""} />
            <span className="ml-1">Atualizar</span>
          </Button>
          {semEmbedding > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={gerarEmbeddings}
              disabled={gerandoEmb}
              className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
            >
              {gerandoEmb ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              <span className="ml-1">Gerar Embeddings ({semEmbedding})</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 gap-4">
        {(["base", "pendentes", "novo"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t === "base"
              ? `Q&A Aprovados (${qaBase.filter((q) => q.aprovado).length})`
              : t === "pendentes"
                ? `Fila de Aprovação ${pendentes.length > 0 ? `(${pendentes.length})` : ""}`
                : "Novo Q&A"}
          </button>
        ))}
      </div>

      {/* ---- ABA: BASE ---- */}
      {tab === "base" && (
        <div className="space-y-2">
          {loadingBase ? (
            <div className="flex items-center gap-2 text-zinc-400 py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Carregando...
            </div>
          ) : qaBase.filter((q) => q.aprovado).length === 0 ? (
            <div className="text-center text-zinc-400 py-12 text-sm">
              Nenhum Q&A aprovado ainda. Aprove itens da fila ou crie um novo.
            </div>
          ) : (
            qaBase
              .filter((q) => q.aprovado)
              .map((qa) => (
                <div key={qa.id} className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50"
                    onClick={() => setExpandido(expandido === qa.id ? null : qa.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-medium whitespace-nowrap">
                        {qa.categoria}
                      </span>
                      <span className="text-sm text-zinc-700 truncate">{qa.pergunta_exemplo}</span>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      {!qa.embedding_gerado_at && (
                        <span className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded">
                          sem embedding
                        </span>
                      )}
                      <span className="text-xs text-zinc-400">{qa.usos_total} usos</span>
                      <ScoreBadge score={qa.score_confianca} />
                      {expandido === qa.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {expandido === qa.id && (
                    <div className="px-4 pb-4 border-t border-zinc-100 pt-3 space-y-3">
                      <div>
                        <p className="text-xs text-zinc-400 mb-1">Pergunta</p>
                        <p className="text-sm text-zinc-700">{qa.pergunta_exemplo}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 mb-1">Resposta</p>
                        <p className="text-sm text-zinc-700 whitespace-pre-wrap">{qa.resposta_template}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-400">
                        <span>Versão {qa.versao}</span>
                        <span>Criado: {fmt(qa.criado_at)}</span>
                        {qa.embedding_gerado_at && <span>Embedding: {fmt(qa.embedding_gerado_at)}</span>}
                        <span>Acertos: {qa.acertos} | Erros: {qa.erros}</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => desativar(qa.id)}
                        >
                          <Trash2 size={13} className="mr-1" /> Desativar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}

      {/* ---- ABA: PENDENTES ---- */}
      {tab === "pendentes" && (
        <div className="space-y-3">
          {loadingPend ? (
            <div className="flex items-center gap-2 text-zinc-400 py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Carregando...
            </div>
          ) : pendentes.length === 0 ? (
            <div className="text-center text-zinc-400 py-12 text-sm">
              Nenhum item aguardando aprovação.
            </div>
          ) : (
            pendentes.map((p) => (
              <div key={p.id} className="border border-zinc-200 rounded-lg bg-white p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    {p.categoria_sugerida && (
                      <span className="text-xs px-2 py-0.5 bg-zinc-100 text-zinc-600 border border-zinc-200 rounded">
                        {p.categoria_sugerida}
                      </span>
                    )}
                    <div>
                      <p className="text-xs text-zinc-400">Pergunta do cliente</p>
                      <p className="text-sm text-zinc-700">{p.pergunta_original}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-400">Resposta do operador</p>
                      <p className="text-sm text-zinc-600 whitespace-pre-wrap">{p.resposta_original}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => aprovar(p.id)}
                    >
                      <CheckCircle2 size={13} className="mr-1" /> Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => rejeitar(p.id)}
                    >
                      <XCircle size={13} className="mr-1" /> Rejeitar
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-zinc-400">
                  Grupo: {p.grupo_id} · Confiança: {p.confianca_extracao} · {fmt(p.criado_at)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ---- ABA: NOVO ---- */}
      {tab === "novo" && (
        <div className="max-w-xl space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Categoria *</label>
            <input
              className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: NFe, App Linx, TEF/PIX..."
              value={novoCategoria}
              onChange={(e) => setNovoCategoria(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Pergunta de exemplo *</label>
            <textarea
              rows={3}
              className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Como o cliente costuma perguntar..."
              value={novoPergunta}
              onChange={(e) => setNovoPergunta(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Resposta *</label>
            <textarea
              rows={4}
              className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Resposta padrão que será enviada..."
              value={novoResposta}
              onChange={(e) => setNovoResposta(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              checked={novoAprovado}
              onChange={(e) => setNovoAprovado(e.target.checked)}
              className="rounded"
            />
            Aprovar imediatamente (admin)
          </label>
          <Button onClick={salvarNovo} disabled={salvando} className="w-full">
            {salvando ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
            Salvar Q&A
          </Button>
        </div>
      )}
    </div>
  );
}
