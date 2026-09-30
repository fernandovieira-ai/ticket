"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle, AlertTriangle, Boxes, ChevronRight, CircleHelp, CheckCircle2, Code2,
  CreditCard, Eye, Fuel, Info, Lightbulb, Loader2, RefreshCw, Sparkles, XCircle,
} from "lucide-react";
import type { ErroPainel, PainelErrosBase } from "@/agents/core/painel-erros";
import s from "./painel-erros.module.css";

interface BaseInfo { id: string; nome: string }
interface PropostaResumo {
  id: string; titulo: string; analise: string; correcao_proposta: string; sql_correcao: string | null;
  base_alvo: string; tipo: string; nivel_risco: string; status: string; painel_codigo: string | null;
}
interface AnaliseGrupo { estado: "rodando" | "ok" | "erro"; erro?: string; existente?: boolean; proposta?: PropostaResumo; total?: number }
interface ReprocGrupo { estado: "confirmar" | "rodando" | "ok" | "erro"; marcados?: number; ignorados?: number; erro?: string }
interface CandidatoFP { id: number; tipo: string; descricao: string }
interface ItemPrevFP { codigo: string; empresa: string; valorAdiantamento: number; formaAtual: CandidatoFP }
interface CandidatoTM { id: number; descricao: string }
interface ItemPrevEQ {
  codigos: string[]; empresa: number; cod_item: number; des_item: string; cod_almoxarifado: number; des_almoxarifado: string;
  saldoReal: number; quantidadeNecessaria: number; deficit: number; dataReferencia: string; dataEntrada: string;
  custoUnitario: number | null; valorEntrada: number | null;
  /** Texto gravado em des_observacao do movimento — "AJUSTE DO PAINEL" + origem (caixa/turno/mlid) da(s) venda(s) */
  observacao: string;
}
/** Resultado de aplicar o ajuste de estoque (entrada lançada ou só reprocessado, ver AjusteEstoqueBloco) */
interface ResultadoAjusteEQ { entradasLancadas: number; codigosReprocessados: number; valorTotal: number; erro?: string }
interface ItemConfComb {
  codigos: string[]; empresa: number; cod_item: number; des_item: string; cod_almoxarifado: number; des_almoxarifado: string;
  saldoReal: number; quantidadeNecessaria: number; deficit: number; dataReferencia: string;
}
/** Conferência de saldo de combustível — só leitura, nunca ajusta/lança nada (ver agents/core/conferir-combustivel.ts) */
interface CombConferencia { estado: "rodando" | "ok" | "erro"; pendentes?: ItemConfComb[]; prontos?: ItemConfComb[]; erro?: string }
/** Modos que não passam pela análise de IA (têm ação própria e determinística) — espelha agents/core/regras-painel.ts */
const MODOS_SEM_ANALISE = new Set(["somente_reprocessar", "ajustar_pagamento", "ajustar_estoque"]);
const RISCO_LABEL: Record<string, string> = { baixo: "Baixo", medio: "Médio", alto: "Alto", critico: "Crítico" };
type Dim = "empresa" | "categoria" | "causa" | "data" | "caixa";
type Visao = "lista" | "matriz";

const NOME_DIM: Record<Dim, string> = { empresa: "Empresa", categoria: "Tipo de erro", causa: "Causa", data: "Dia", caixa: "Caixa" };
const SUBITEM: Record<Dim, [string, string]> = {
  empresa: ["empresa", "empresas"], categoria: ["tipo", "tipos"], causa: ["causa", "causas"], data: ["dia", "dias"], caixa: ["caixa", "caixas"],
};
const PRESETS: { id: string; nome: string; dims: Dim[] }[] = [
  { id: "a", nome: "Empresa › Tipo › Causa", dims: ["empresa", "categoria", "causa"] },
  { id: "b", nome: "Tipo › Empresa › Causa", dims: ["categoria", "empresa", "causa"] },
  { id: "c", nome: "Tipo › Causa › Empresa", dims: ["categoria", "causa", "empresa"] },
  { id: "d", nome: "Dia › Empresa › Tipo", dims: ["data", "empresa", "categoria"] },
];
// O que fazer com cada tipo de erro vem do banco (agente_regras_painel, tela Configuração), não fica fixo
// aqui — este é só o rótulo visual usado enquanto a lista de regras carrega ou para uma categoria nova.
interface Regra { categoria: string; modo: string; titulo: string; descricao: string }
// Ícone do modo é só uma pista visual de COMO o tipo é tratado — nunca cor de risco (isso vem do
// campo "risco" de cada erro/proposta, uma dimensão totalmente separada; misturar as duas confundia
// a leitura, ex.: "Manual" e "Risco Alto" usando o mesmo pill vermelho sem terem nada a ver).
const ICONE_MODO: Record<string, typeof RefreshCw> = {
  somente_reprocessar: RefreshCw, ajustar_pagamento: CreditCard, ajustar_estoque: Boxes,
  elegivel_automatico: Sparkles, assistido: Eye, manual: CircleHelp,
};
const REGRA_PADRAO: Regra = { categoria: "", modo: "manual", titulo: "Manual", descricao: "Tipo ainda sem regra definida; exige análise." };

const n0 = (n: number) => n.toLocaleString("pt-BR");
const fmtData = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pill = (r: "alto" | "medio") => <span className={`${s.pill} ${s[r]}`}>{r === "alto" ? "Alto" : "Médio"}</span>;
const riscoMax = (its: ErroPainel[]): "alto" | "medio" => (its.some((e) => e.risco === "alto") ? "alto" : "medio");

function agrupar(items: ErroPainel[], dim: Dim): [string, ErroPainel[]][] {
  const m = new Map<string, ErroPainel[]>();
  for (const e of items) {
    const k = e[dim] as string;
    const arr = m.get(k);
    if (arr) arr.push(e); else m.set(k, [e]);
  }
  const arr = [...m.entries()];
  arr.sort(dim === "data" ? (a, b) => (a[0] < b[0] ? 1 : -1) : (a, b) => b[1].length - a[1].length);
  return arr;
}

type FaseAjusteEQ =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "preview"; itens: ItemPrevEQ[]; semDeficit: string[]; semCusto: ItemPrevEQ[] }
  | { fase: "aplicando" }
  | { fase: "ok"; resultado: ResultadoAjusteEQ };

/**
 * Ajuste de estoque (categoria "Saldo insuficiente · Produto de loja"): assim que monta, já recalcula o
 * saldo real no EMSys3 (não precisa escolher o tipo de movimento antes disso — a prévia não depende dele).
 * Usa o tipo de movimento salvo como padrão desta base quando existe, só perguntando de novo se o operador
 * clicar em "Trocar". "Dar entrada ou não" é a mesma escolha de sempre: usar o botão "Só reprocessar no
 * painel" (acima, sempre visível) em vez de confirmar a entrada aqui.
 */
function AjusteEstoqueBloco({ baseId, codigos, onAplicado }: { baseId: string; codigos: string[]; onAplicado: () => void }) {
  const [fase, setFase] = useState<FaseAjusteEQ>({ fase: "carregando" });
  const [padrao, setPadrao] = useState<CandidatoTM | null | "carregando">("carregando");
  const [trocando, setTrocando] = useState(false);
  const [escolhido, setEscolhido] = useState<CandidatoTM | null>(null);
  const [escolhidoDaBusca, setEscolhidoDaBusca] = useState(false);
  const [usarComoPadrao, setUsarComoPadrao] = useState(true);
  const [buscaMsg, setBuscaMsg] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoTM[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [buscaErro, setBuscaErro] = useState("");

  const chaveCodigos = codigos.join(",");

  const carregarPreview = useCallback(async () => {
    setFase({ fase: "carregando" });
    try {
      const res = await fetch("/api/agentes/painel-erros/ajuste-estoque", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, codigos: chaveCodigos.split(",") }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setFase({ fase: "erro", mensagem: j.erro ?? j.error ?? "Falha ao calcular o saldo real" }); return; }
      setFase({ fase: "preview", itens: j.itens ?? [], semDeficit: j.semDeficit ?? [], semCusto: j.semCusto ?? [] });
    } catch (e: any) {
      setFase({ fase: "erro", mensagem: e?.message ?? "Falha ao calcular o saldo real" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId, chaveCodigos]);

  useEffect(() => { carregarPreview(); }, [carregarPreview]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/agentes/painel-erros/ajuste-estoque/tipo-padrao?cliente_id=${encodeURIComponent(baseId)}`);
        const j = await res.json().catch(() => ({}));
        if (!cancelado) setPadrao(j.tipo ?? null);
      } catch {
        if (!cancelado) setPadrao(null);
      }
    })();
    return () => { cancelado = true; };
  }, [baseId]);

  async function buscar() {
    const mensagem = buscaMsg.trim();
    if (!mensagem) return;
    setBuscando(true); setBuscaErro("");
    try {
      const res = await fetch("/api/agentes/painel-erros/tipos-movimento", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, mensagem }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.erro ?? j.error ?? "Falha na busca");
      if (!j.candidatos.length) throw new Error(`Nenhum tipo de movimento de entrada encontrado para "${mensagem}". Tente outro termo.`);
      setCandidatos(j.candidatos);
    } catch (e: any) {
      setBuscaErro(e?.message ?? "Falha na busca");
    } finally {
      setBuscando(false);
    }
  }

  async function confirmar(tipo: CandidatoTM | null) {
    setFase({ fase: "aplicando" });
    if (tipo && escolhidoDaBusca && usarComoPadrao) {
      fetch("/api/agentes/painel-erros/ajuste-estoque/tipo-padrao", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, tipoMovimento: tipo }),
      }).catch(() => {});
    }
    try {
      const res = await fetch("/api/agentes/painel-erros/ajuste-estoque/aplicar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, codigos, tipoMovimento: tipo }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.erro ?? j.error ?? "Falha ao aplicar");
      onAplicado();
      setFase({ fase: "ok", resultado: { entradasLancadas: j.entradasLancadas, codigosReprocessados: j.codigosReprocessados, valorTotal: j.valorTotal, erro: j.erro } });
    } catch (e: any) {
      setFase({ fase: "erro", mensagem: e?.message ?? "Falha ao aplicar" });
    }
  }

  function trocarTipoMovimento() {
    setTrocando(true); setEscolhido(null); setEscolhidoDaBusca(false); setCandidatos(null); setBuscaMsg("");
  }

  function limparPadrao() {
    setPadrao(null);
    setTrocando(true);
    fetch("/api/agentes/painel-erros/ajuste-estoque/tipo-padrao", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: baseId }),
    }).catch(() => {});
  }

  if (fase.fase === "carregando") {
    return <div className={s.confirma}><div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Calculando o saldo real no EMSys3…</div></div>;
  }
  if (fase.fase === "erro") {
    return (
      <div className={s.analiseErro}>
        <span className={s.confirmaMsg}><XCircle size={15} />{fase.mensagem}</span>
        <div><button type="button" className={s.btn} onClick={carregarPreview}>Tentar de novo</button></div>
      </div>
    );
  }
  if (fase.fase === "aplicando") {
    return <div className={s.confirma}><div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Aplicando…</div></div>;
  }
  if (fase.fase === "ok") {
    return (
      <div className={s.confirma}>
        <div className={s.okBox}>
          <CheckCircle2 size={15} />
          <span>
            <b>{fase.resultado.entradasLancadas}</b> {fase.resultado.entradasLancadas === 1 ? "entrada lançada" : "entradas lançadas"}, <b>{fase.resultado.codigosReprocessados}</b> código(s) reprocessado(s).
            {fase.resultado.erro && <> {fase.resultado.erro}</>} Ao fechar, a lista é atualizada.
          </span>
        </div>
      </div>
    );
  }

  const { itens, semDeficit, semCusto } = fase;
  const tipoAtual = escolhido ?? (!trocando && padrao !== "carregando" ? padrao : null);

  return (
    <div className={s.confirma}>
      {itens.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span>Saldo real recalculado agora — {itens.length} {itens.length === 1 ? "item precisa" : "itens precisam"} de entrada:</span>
          {itens.map((it, i) => (
            <span key={i} style={{ paddingLeft: 8 }}>
              • <b>{it.des_item}</b> ({it.des_almoxarifado}): saldo real {n0(it.saldoReal)}, precisa {n0(it.quantidadeNecessaria)} →
              {" "}entrada de <b>{n0(it.deficit)}</b> em {fmtData(it.dataEntrada)}, {it.valorEntrada != null ? it.valorEntrada.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "sem custo confirmado"}
              {" "}({it.codigos.length} {it.codigos.length === 1 ? "código" : "códigos"})
              <br /><span style={{ fontSize: 11, opacity: 0.7, paddingLeft: 12 }}>{it.observacao}</span>
            </span>
          ))}
          <span><b>Total: {itens.reduce((t, x) => t + (x.valorEntrada ?? 0), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></span>
        </div>
      )}
      {semDeficit.length > 0 && (
        <span style={{ fontSize: 13 }}>{semDeficit.length} código(s) já têm saldo real suficiente agora — só serão reprocessados, sem lançar entrada.</span>
      )}
      {semCusto.length > 0 && (
        <p className={s.aviso2} style={{ margin: 0 }}>
          <Info size={13} />{semCusto.length} item(ns) com déficit real mas sem custo unitário confirmado no EMSys3 — não serão ajustados aqui; precisam de revisão manual do custo.
        </p>
      )}

      {itens.length === 0 && semDeficit.length > 0 && (
        <div className={s.acoesItem}>
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => confirmar(null)}>Confirmar reprocessamento ({semDeficit.length})</button>
        </div>
      )}

      {itens.length > 0 && padrao === "carregando" && (
        <div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Carregando tipo de movimento padrão desta base…</div>
      )}

      {itens.length > 0 && padrao !== "carregando" && tipoAtual && (
        <>
          <span style={{ fontSize: 13 }}>
            Vai lançar a(s) entrada(s) acima usando <b>{tipoAtual.descricao}</b>{!escolhido && padrao ? " (padrão desta base)" : ""}.
          </span>
          {escolhidoDaBusca && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={usarComoPadrao} onChange={(ev) => setUsarComoPadrao(ev.target.checked)} />
              Usar sempre este tipo de movimento nesta base (não perguntar de novo)
            </label>
          )}
          <div className={s.acoesItem}>
            <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => confirmar(tipoAtual)}>Confirmar entrada e reprocessar</button>
            <button type="button" className={s.btn} onClick={trocarTipoMovimento}>Trocar tipo de movimento</button>
            {!escolhido && padrao && <button type="button" className={s.btn} onClick={limparPadrao}>Não usar mais este padrão</button>}
          </div>
        </>
      )}

      {itens.length > 0 && padrao !== "carregando" && !tipoAtual && (
        <>
          {!candidatos && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                Qual tipo de movimento usar na entrada? (geralmente "entrada por inventário")
                <input
                  type="text" value={buscaMsg} placeholder="Ex.: entrada por inventario"
                  disabled={buscando}
                  onChange={(ev) => setBuscaMsg(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") buscar(); }}
                  style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, background: "var(--surface, #fff)", color: "inherit" }}
                />
              </label>
              {buscaErro && <p className={s.aviso2} style={{ margin: 0 }}><XCircle size={13} />{buscaErro}</p>}
              <div className={s.acoesItem}>
                <button type="button" className={`${s.btn} ${s.primary}`} disabled={buscando || !buscaMsg.trim()} onClick={buscar}>
                  {buscando ? <Loader2 size={13} className="animate-spin" /> : null} Buscar tipo de movimento
                </button>
              </div>
            </>
          )}
          {candidatos && (
            <>
              <span style={{ fontSize: 13 }}>Encontrei estes tipos de movimento de entrada no EMSys3 — qual usar?</span>
              <div className={s.acoesItem}>
                {candidatos.map((c) => (
                  <button key={c.id} type="button" className={s.btn} onClick={() => { setEscolhido(c); setEscolhidoDaBusca(true); }}>{c.descricao}</button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {(itens.length > 0 || semDeficit.length > 0) && (
        <p className={s.aviso2} style={{ margin: 0 }}>
          <Info size={13} />Se não quiser lançar entrada agora, use "Só reprocessar no painel" acima.
        </p>
      )}
    </div>
  );
}

type FaseAjustePagto =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "preview"; itens: ItemPrevFP[]; semAdiantamento: string[] }
  | { fase: "aplicando" }
  | { fase: "ok"; resultado: { ajustados: number; ignorados: number; valorTotal: number } };

/**
 * Ajuste de forma de pagamento (categoria "Cliente sem saldo de adiantamento"): recalcula a prévia assim
 * que monta (não depende da forma escolhida) e usa a forma salva como padrão desta base quando existe —
 * mesmo comportamento de <AjusteEstoqueBloco>, ver comentário lá.
 */
function AjustePagamentoBloco({ baseId, codigos, onAplicado }: { baseId: string; codigos: string[]; onAplicado: () => void }) {
  const [fase, setFase] = useState<FaseAjustePagto>({ fase: "carregando" });
  const [padrao, setPadrao] = useState<CandidatoFP | null | "carregando">("carregando");
  const [trocando, setTrocando] = useState(false);
  const [escolhido, setEscolhido] = useState<CandidatoFP | null>(null);
  const [escolhidoDaBusca, setEscolhidoDaBusca] = useState(false);
  const [usarComoPadrao, setUsarComoPadrao] = useState(true);
  const [buscaMsg, setBuscaMsg] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoFP[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [buscaErro, setBuscaErro] = useState("");

  const chaveCodigos = codigos.join(",");

  const carregarPreview = useCallback(async () => {
    setFase({ fase: "carregando" });
    try {
      const res = await fetch("/api/agentes/painel-erros/ajuste-pagamento", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, codigos: chaveCodigos.split(",") }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setFase({ fase: "erro", mensagem: j.erro ?? j.error ?? "Falha na prévia" }); return; }
      setFase({ fase: "preview", itens: j.itens ?? [], semAdiantamento: j.semAdiantamento ?? [] });
    } catch (e: any) {
      setFase({ fase: "erro", mensagem: e?.message ?? "Falha na prévia" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId, chaveCodigos]);

  useEffect(() => { carregarPreview(); }, [carregarPreview]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/agentes/painel-erros/ajuste-pagamento/forma-padrao?cliente_id=${encodeURIComponent(baseId)}`);
        const j = await res.json().catch(() => ({}));
        if (!cancelado) setPadrao(j.forma ?? null);
      } catch {
        if (!cancelado) setPadrao(null);
      }
    })();
    return () => { cancelado = true; };
  }, [baseId]);

  async function buscar() {
    const mensagem = buscaMsg.trim();
    if (!mensagem) return;
    setBuscando(true); setBuscaErro("");
    try {
      const res = await fetch("/api/agentes/painel-erros/formas-pagto", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, mensagem }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.erro ?? j.error ?? "Falha na busca");
      if (!j.candidatos.length) throw new Error(`Nenhuma forma de pagamento encontrada para "${mensagem}". Tente outro termo.`);
      setCandidatos(j.candidatos);
    } catch (e: any) {
      setBuscaErro(e?.message ?? "Falha na busca");
    } finally {
      setBuscando(false);
    }
  }

  async function confirmar(forma: CandidatoFP) {
    setFase({ fase: "aplicando" });
    if (escolhidoDaBusca && usarComoPadrao) {
      fetch("/api/agentes/painel-erros/ajuste-pagamento/forma-padrao", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, formaPagto: forma }),
      }).catch(() => {});
    }
    try {
      const res = await fetch("/api/agentes/painel-erros/ajuste-pagamento/aplicar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, codigos, forma }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.erro ?? j.error ?? "Falha ao aplicar");
      onAplicado();
      setFase({ fase: "ok", resultado: { ajustados: j.ajustados, ignorados: j.ignorados, valorTotal: j.valorTotal } });
    } catch (e: any) {
      setFase({ fase: "erro", mensagem: e?.message ?? "Falha ao aplicar" });
    }
  }

  function trocarForma() {
    setTrocando(true); setEscolhido(null); setEscolhidoDaBusca(false); setCandidatos(null); setBuscaMsg("");
  }

  function limparPadrao() {
    setPadrao(null);
    setTrocando(true);
    fetch("/api/agentes/painel-erros/ajuste-pagamento/forma-padrao", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: baseId }),
    }).catch(() => {});
  }

  if (fase.fase === "carregando") {
    return <div className={s.confirma}><div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Carregando prévia…</div></div>;
  }
  if (fase.fase === "erro") {
    return (
      <div className={s.analiseErro}>
        <span className={s.confirmaMsg}><XCircle size={15} />{fase.mensagem}</span>
        <div><button type="button" className={s.btn} onClick={carregarPreview}>Tentar de novo</button></div>
      </div>
    );
  }
  if (fase.fase === "aplicando") {
    return <div className={s.confirma}><div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Aplicando…</div></div>;
  }
  if (fase.fase === "ok") {
    return (
      <div className={s.confirma}>
        <div className={s.okBox}>
          <CheckCircle2 size={15} />
          <span>
            <b>{fase.resultado.ajustados}</b> {fase.resultado.ajustados === 1 ? "venda ajustada" : "vendas ajustadas"} e reprocessada(s)
            {fase.resultado.ignorados > 0 && <> · {fase.resultado.ignorados} ignorada(s)</>}. Ao fechar, a lista é atualizada.
          </span>
        </div>
      </div>
    );
  }

  const { itens, semAdiantamento } = fase;

  if (!itens.length) {
    return (
      <div className={s.confirma}>
        <span style={{ fontSize: 13 }}>Nenhum dos {semAdiantamento.length} código(s) selecionado(s) tem pagamento em Adiantamento Cliente — nada a trocar aqui.</span>
      </div>
    );
  }

  const formaAtual = escolhido ?? (!trocando && padrao !== "carregando" ? padrao : null);

  return (
    <div className={s.confirma}>
      <span style={{ fontSize: 13 }}>
        <b>{itens.length}</b> {itens.length === 1 ? "venda" : "vendas"} em <b>{itens[0]?.formaAtual.descricao ?? "Adiantamento Cliente"}</b>, total{" "}
        <b>{itens.reduce((t, x) => t + x.valorAdiantamento, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>.
        {semAdiantamento.length > 0 && <> {semAdiantamento.length} código(s) sem adiantamento não serão tocados.</>}
      </span>

      {padrao === "carregando" && (
        <div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Carregando forma de pagamento padrão desta base…</div>
      )}

      {padrao !== "carregando" && formaAtual && (
        <>
          <span style={{ fontSize: 13 }}>
            Vai trocar para <b>{formaAtual.descricao}</b>{!escolhido && padrao ? " (padrão desta base)" : ""}. Isso muda só o registro interno (caixa); a nota fiscal já emitida não é alterada.
          </span>
          {escolhidoDaBusca && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={usarComoPadrao} onChange={(ev) => setUsarComoPadrao(ev.target.checked)} />
              Usar sempre esta forma de pagamento nesta base (não perguntar de novo)
            </label>
          )}
          <div className={s.acoesItem}>
            <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => confirmar(formaAtual)}>Confirmar ajuste e reprocessar</button>
            <button type="button" className={s.btn} onClick={trocarForma}>Trocar forma de pagamento</button>
            {!escolhido && padrao && <button type="button" className={s.btn} onClick={limparPadrao}>Não usar mais este padrão</button>}
          </div>
        </>
      )}

      {padrao !== "carregando" && !formaAtual && (
        <>
          {!candidatos && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                Para qual forma de pagamento? (ex.: dinheiro, pix, cartão)
                <input
                  type="text" value={buscaMsg} placeholder="Ex.: dinheiro"
                  disabled={buscando}
                  onChange={(ev) => setBuscaMsg(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") buscar(); }}
                  style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, background: "var(--surface, #fff)", color: "inherit" }}
                />
              </label>
              {buscaErro && <p className={s.aviso2} style={{ margin: 0 }}><XCircle size={13} />{buscaErro}</p>}
              <div className={s.acoesItem}>
                <button type="button" className={`${s.btn} ${s.primary}`} disabled={buscando || !buscaMsg.trim()} onClick={buscar}>
                  {buscando ? <Loader2 size={13} className="animate-spin" /> : null} Buscar forma de pagamento
                </button>
              </div>
            </>
          )}
          {candidatos && (
            <>
              <span style={{ fontSize: 13 }}>Encontrei estas formas de pagamento no EMSys3 — qual usar (só troca o registro interno, a nota fiscal não muda)?</span>
              <div className={s.acoesItem}>
                {candidatos.map((c) => (
                  <button key={c.id} type="button" className={s.btn} onClick={() => { setEscolhido(c); setEscolhidoDaBusca(true); }}>{c.descricao}</button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

interface PadraoItem { chave: string; titulo: string; definido: boolean; descricao: string | null }

/**
 * Painel (drawer) com os padrões salvos desta base (tipo de movimento de entrada, forma de pagamento, ...)
 * — tela única pra ver/limpar o que os blocos de ajuste (AjusteEstoqueBloco, AjustePagamentoBloco) usam pra
 * não perguntar de novo. Definir um padrão NOVO continua sendo feito na hora, dentro do próprio ajuste
 * (marcando "usar sempre" ao escolher o candidato) — aqui só se vê e se limpa o que já foi salvo.
 */
function PadroesBaseDrawer({ baseId, nomeBase, aberto, onFechar }: { baseId: string; nomeBase: string; aberto: boolean; onFechar: () => void }) {
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [padroes, setPadroes] = useState<PadraoItem[]>([]);
  const [erro, setErro] = useState("");
  const [limpando, setLimpando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!baseId) return;
    setEstado("carregando");
    try {
      const res = await fetch(`/api/agentes/painel-erros/padroes?cliente_id=${encodeURIComponent(baseId)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Falha ao carregar");
      setPadroes(j.padroes ?? []);
      setEstado("ok");
    } catch (e: any) {
      setErro(e?.message ?? "Falha ao carregar");
      setEstado("erro");
    }
  }, [baseId]);

  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);

  async function limpar(chave: string) {
    setLimpando(chave);
    try {
      await fetch("/api/agentes/painel-erros/padroes", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: baseId, chave }),
      });
      await carregar();
    } finally {
      setLimpando(null);
    }
  }

  if (!aberto) return null;

  return (
    <>
      <div className={s.ov} onClick={onFechar} />
      <aside className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="pd">
        <div className={s.dh}>
          <div>
            <span className={s.tag}>Configuração</span>
            <h2 id="pd">Padrões desta base</h2>
            <p className={s.sub}>{nomeBase} — usados pra não perguntar de novo qual candidato escolher em cada ajuste.</p>
          </div>
          <button type="button" className={s.btn} onClick={onFechar}>Fechar</button>
        </div>
        <div className={s.db}>
          {estado === "carregando" && <div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Carregando…</div>}
          {estado === "erro" && <p className={s.aviso2} style={{ margin: 0 }}><XCircle size={13} />{erro}</p>}
          {estado === "ok" && padroes.length === 0 && <p style={{ fontSize: 13 }}>Nenhum padrão configurável ainda.</p>}
          {estado === "ok" && padroes.map((p) => (
            <div key={p.chave} className={s.item} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <b style={{ fontSize: 13 }}>{p.titulo}</b>
                <div style={{ fontSize: 13 }}>
                  {p.definido ? p.descricao : "Não definido — a tela pergunta na hora do ajuste."}
                </div>
              </div>
              {p.definido && (
                <button type="button" className={s.btn} disabled={limpando === p.chave} onClick={() => limpar(p.chave)}>
                  {limpando === p.chave ? <Loader2 size={13} className="animate-spin" /> : null} Limpar
                </button>
              )}
            </div>
          ))}
          {estado === "ok" && (
            <p className={s.aviso2} style={{ marginTop: 12 }}>
              <Info size={13} />Pra definir um padrão novo, marque "usar sempre" na primeira vez que escolher o candidato dentro do ajuste (tipo de movimento ou forma de pagamento).
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

/** Painel de UMA base, mostrado em página própria (a lista de bases fica em painel-home). */
export function PainelClient({ bases, header }: { bases: BaseInfo[]; header?: ReactNode }) {
  const [ativa, setAtiva] = useState(bases[0]?.id ?? "");
  const [dados, setDados] = useState<Record<string, PainelErrosBase>>({});
  const [carregando, setCarregando] = useState<Set<string>>(new Set());
  const [falhaReq, setFalhaReq] = useState<Record<string, string>>({});

  const [preset, setPreset] = useState("a");
  const [visao, setVisao] = useState<Visao>("lista");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [fEmp, setFEmp] = useState<string | null>(null);
  const [fCat, setFCat] = useState<string | null>(null);
  const [mais, setMais] = useState<Record<string, number>>({});
  const [gaveta, setGaveta] = useState<{ codes: string[]; titulo: string } | null>(null);
  const [analises, setAnalises] = useState<Record<string, AnaliseGrupo>>({});
  const [reproc, setReproc] = useState<Record<string, ReprocGrupo>>({});
  const [regras, setRegras] = useState<Record<string, Regra>>({});
  const [combAjuste, setCombAjuste] = useState<Record<string, CombConferencia>>({});
  const regraDe = useCallback((categoria: string): Regra => regras[categoria] ?? { ...REGRA_PADRAO, categoria }, [regras]);
  const [sujo, setSujo] = useState(false); // houve reprocessamento: atualiza a lista ao fechar a gaveta
  const [padroesAberto, setPadroesAberto] = useState(false);

  const dims = PRESETS.find((p) => p.id === preset)!.dims;

  const carregar = useCallback(async (id: string, forcar = false) => {
    setCarregando((p) => new Set(p).add(id));
    try {
      const res = await fetch(`/api/agentes/painel-erros?cliente_id=${id}${forcar ? "&forcar=1" : ""}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setDados((p) => ({ ...p, [id]: j }));
      setFalhaReq((p) => { const n = { ...p }; delete n[id]; return n; });
    } catch (e: any) {
      setFalhaReq((p) => ({ ...p, [id]: e?.message ?? "Falha ao carregar" }));
    } finally {
      setCarregando((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  }, []);

  useEffect(() => { bases.forEach((b) => carregar(b.id)); }, [bases, carregar]);

  // O que fazer com cada tipo de erro vem do banco — carregado uma vez, edição fica em Agentes › Configurar
  useEffect(() => {
    fetch("/api/agentes/painel-erros/regras").then((r) => r.json()).then((j) => {
      const m: Record<string, Regra> = {};
      for (const r of j.regras ?? []) m[r.categoria] = r;
      setRegras(m);
    }).catch(() => {});
  }, []);

  // Ao fechar a gaveta depois de reprocessar, a lista é atualizada (os códigos reprocessados saem dela)
  const fecharGaveta = useCallback(() => {
    setGaveta(null);
    if (sujo) { setSujo(false); setSel(new Set()); setReproc({}); setCombAjuste({}); carregar(ativa, true); }
  }, [sujo, ativa, carregar]);

  const atual = dados[ativa];
  const todos: ErroPainel[] = useMemo(() => (atual?.ok ? atual.erros : []), [atual]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return todos.filter((e) =>
      (!fEmp || e.empresa === fEmp) && (!fCat || e.categoria === fCat) &&
      (!t || [e.codigo, e.caixa, e.mlid, e.detalhe, e.empresa, e.categoria, e.causa].join(" ").toLowerCase().includes(t)));
  }, [todos, q, fEmp, fCat]);

  const hoje = useMemo(() => todos.reduce((m, e) => (e.data > m ? e.data : m), "0000-00-00"), [todos]);
  const dias = (d: string) => Math.round((Date.parse(hoje) - Date.parse(d)) / 864e5);
  const idade = (its: ErroPainel[]) => {
    const d = its.reduce((m, e) => (e.data < m ? e.data : m), "9999-99-99");
    const n = dias(d);
    return n === 0 ? "hoje" : `há ${n} d`;
  };
  const rotulo = (dim: Dim, k: string) => (dim === "data" ? `${fmtData(k)}${dias(k) === 0 ? " · hoje" : ""}` : k);

  /* resumo da base */
  const resumo = useMemo(() => {
    if (!todos.length) return null;
    const emps = agrupar(todos, "empresa");
    const cats = agrupar(todos, "categoria");
    const causas = new Set(todos.map((e) => e.causa)).size;
    const topo = emps[0];
    const topCat = cats[0];
    const desde = todos.reduce((m, e) => (e.data < m ? e.data : m), "9999-99-99");
    const causasTop = new Set(todos.filter((e) => e.categoria === topCat[0]).map((e) => e.causa)).size;
    return { total: todos.length, emps, cats, causas, topo, topCat, desde, causasTop };
  }, [todos]);

  /* árvore */
  const ids =(its: ErroPainel[], depth: number, pai: string, out: string[]): string[] => {
    if (depth >= dims.length) return out;
    for (const [k, g] of agrupar(its, dims[depth])) { const id = `${pai}/${encodeURIComponent(k)}`; out.push(id); ids(g, depth + 1, id, out); }
    return out;
  };

  function alternar(codes: string[]) {
    setSel((prev) => {
      const n = new Set(prev);
      const todosSel = codes.every((c) => n.has(c));
      for (const c of codes) todosSel ? n.delete(c) : n.add(c);
      return n;
    });
  }
  function alternarAberto(id: string) {
    setAbertos((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function folhas(its: ErroPainel[], pai: string, depth: number): ReactNode[] {
    const lim = mais[pai] ?? 25;
    const out: ReactNode[] = its.slice(0, lim).map((e) => (
      <div key={e.codigo} className={s.err} style={{ ["--depth" as string]: depth }}>
        <input type="checkbox" className={s.ck} checked={sel.has(e.codigo)} onChange={() => alternar([e.codigo])} aria-label={`Selecionar erro ${e.codigo}`} />
        <span className={s.mono}>{e.codigo}</span>
        <span>{fmtData(e.data)}</span>
        <span className={`${s.mono} ${s.cx}`}>{e.caixa}</span>
        <span className={`${s.mono} ${s.ml}`}>{e.mlid}</span>
        <span className={s.det} title={e.detalhe}>{e.detalhe}</span>
      </div>
    ));
    if (its.length > lim) {
      out.push(
        <div key={`${pai}-mais`} className={s.mais} style={{ ["--depth" as string]: depth }}>
          <button type="button" onClick={() => setMais((p) => ({ ...p, [pai]: lim + 25 }))}>
            Mostrar mais {Math.min(25, its.length - lim)} de {n0(its.length - lim)} restantes
          </button>
        </div>,
      );
    }
    return out;
  }

  function nivel(its: ErroPainel[], depth: number, pai: string, total: number): ReactNode[] {
    if (depth >= dims.length) return folhas(its, pai, depth);
    const dim = dims[depth];
    const out: ReactNode[] = [];
    for (const [k, g] of agrupar(its, dim)) {
      const id = `${pai}/${encodeURIComponent(k)}`;
      const lbl = rotulo(dim, k);
      const codes = g.map((e) => e.codigo);
      const aberto = abertos.has(id);
      const marcados = codes.filter((c) => sel.has(c)).length;
      const prox = depth + 1 < dims.length ? agrupar(g, dims[depth + 1]).length : 0;
      const [um, varios] = depth + 1 < dims.length ? SUBITEM[dims[depth + 1]] : ["", ""];
      const pct = Math.max(1, (g.length / total) * 100);
      out.push(
        <div key={id} className={`${s.row} ${depth === 0 ? s.d0 : ""}`} style={{ ["--depth" as string]: depth }} onClick={() => alternarAberto(id)}>
          <div className={s.first}>
            <button type="button" className={s.tog} aria-expanded={aberto} aria-label={`${aberto ? "Recolher" : "Expandir"} ${lbl}`} onClick={(ev) => { ev.stopPropagation(); alternarAberto(id); }}>
              <ChevronRight size={13} />
            </button>
            <input
              type="checkbox" className={s.ck} aria-label={`Selecionar ${lbl}`}
              checked={marcados === codes.length}
              ref={(el) => { if (el) el.indeterminate = marcados > 0 && marcados < codes.length; }}
              onClick={(ev) => ev.stopPropagation()} onChange={() => alternar(codes)}
            />
            <span className={s.nome}>{lbl}{prox > 0 && <span className={s.cnt}>{prox} {prox === 1 ? um : varios}</span>}</span>
          </div>
          <div className={s.share} title={`${pct.toFixed(0)}% dos erros listados`}><i style={{ width: `${pct.toFixed(1)}%` }} /></div>
          <div className={`${s.r} ${s.num}`}>{n0(g.length)}</div>
          <div className={s.rk}>{pill(riscoMax(g))}</div>
          <div className={s.age}>{idade(g)}</div>
          <div className={s.r}>
            <button type="button" className={s.adj} onClick={(ev) => { ev.stopPropagation(); setGaveta({ codes, titulo: lbl }); }}>{g.every((e) => e.modo === "somente_reprocessar") ? "Reprocessar" : "Ajustar"}</button>
          </div>
        </div>,
      );
      if (aberto) out.push(...nivel(g, depth + 1, id, total));
    }
    return out;
  }

  function arvore(): ReactNode {
    if (!filtrados.length) return <div className={s.vazio}>Nenhum erro com esses filtros.</div>;
    return (
      <div className={s.cols}>
        <div className={`${s.head} ${s.cols}`}>
          <div>{dims.map((d) => NOME_DIM[d]).join(" › ")}</div>
          <div className={s.hs}>Participação</div><div className={s.r}>Erros</div><div className={s.hr}>Risco</div><div className={s.ha}>Mais antigo</div><div />
        </div>
        {nivel(filtrados, 0, "", filtrados.length)}
      </div>
    );
  }

  function matriz(): ReactNode {
    if (!filtrados.length) return <div className={s.vazio}>Nenhum erro com esses filtros.</div>;
    const emps = agrupar(filtrados, "empresa");
    const cats = agrupar(filtrados, "categoria");
    const cel = new Map<string, number>();
    let max = 1;
    for (const e of filtrados) { const k = `${e.empresa}␟${e.categoria}`; const v = (cel.get(k) ?? 0) + 1; cel.set(k, v); if (v > max) max = v; }
    return (
      <table className={s.matrix}>
        <thead><tr><th>Empresa</th>{cats.map(([c]) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
        <tbody>
          {emps.map(([emp, its]) => (
            <tr key={emp}>
              <td><button type="button" className={s.emp} onClick={() => { setFEmp(emp); setVisao("lista"); setPreset("a"); setAbertos(new Set([`/${encodeURIComponent(emp)}`])); }}>{emp}</button></td>
              {cats.map(([c]) => {
                const n = cel.get(`${emp}␟${c}`) ?? 0;
                return n
                  ? <td key={c} className={s.cell}><button type="button" style={{ ["--i" as string]: (n / max).toFixed(2) }} title={`${emp} · ${c}`}
                      onClick={() => { setFEmp(emp); setFCat(c); setVisao("lista"); setPreset("a"); const i1 = `/${encodeURIComponent(emp)}`; setAbertos(new Set([i1, `${i1}/${encodeURIComponent(c)}`])); }}>{n0(n)}</button></td>
                  : <td key={c} className={`${s.cell} ${s.zero}`}>–</td>;
              })}
              <td><b>{n0(its.length)}</b></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td>Total</td>{cats.map(([c, its]) => <td key={c}>{n0(its.length)}</td>)}<td>{n0(filtrados.length)}</td></tr></tfoot>
      </table>
    );
  }

  /* análise real de um grupo (tipo + causa): investiga as bases e gera uma proposta "aguardando" */
  async function analisarGrupo(base: string, cat: string, causa: string, codigos: string[]) {
    const chave = `${base}|${cat}|${causa}`;
    setAnalises((p) => ({ ...p, [chave]: { estado: "rodando" } }));
    try {
      const res = await fetch("/api/agentes/painel-erros/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: base, codigos: codigos.slice(0, 1000), categoria: cat, causa }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.erro ?? j.error ?? "Falha na análise");
      setAnalises((p) => ({ ...p, [chave]: { estado: "ok", existente: j.existente, proposta: j.proposta, total: j.total } }));
    } catch (e: any) {
      setAnalises((p) => ({ ...p, [chave]: { estado: "erro", erro: e?.message ?? "Falha na análise" } }));
    }
  }
  /* só reprocessar no painel: marca reprocessar = true (única escrita nas bases do cliente) */
  async function reprocessarGrupo(base: string, chave: string, codigos: string[]) {
    setReproc((p) => ({ ...p, [chave]: { estado: "rodando" } }));
    let marcados = 0, ignorados = 0;
    try {
      for (let i = 0; i < codigos.length; i += 500) {
        const res = await fetch("/api/agentes/painel-erros/reprocessar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cliente_id: base, codigos: codigos.slice(i, i + 500) }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j.erro ?? j.error ?? "Falha ao reprocessar");
        marcados += j.marcados ?? 0; ignorados += j.ignorados ?? 0;
      }
      setSujo(true);
      setReproc((p) => ({ ...p, [chave]: { estado: "ok", marcados, ignorados } }));
    } catch (e: any) {
      if (marcados > 0) setSujo(true);
      setReproc((p) => ({ ...p, [chave]: { estado: "erro", marcados, ignorados, erro: e?.message ?? "Falha ao reprocessar" } }));
    }
  }

  /* ajuste de forma de pagamento (ex.: "cliente sem saldo de adiantamento") e ajuste de estoque (ex.:
     "saldo insuficiente · produto de loja") são tratados por <AjustePagamentoBloco>/<AjusteEstoqueBloco>,
     componentes próprios (recalculam a prévia assim que montam, sem esperar o operador escolher a forma de
     pagamento/tipo de movimento) — ver definição no topo do arquivo. */

  /* conferência de combustível (nunca ajusta nada — só lê o saldo real do tanque no EMSys3 e devolve
     o veredito: já dá pra reprocessar ou ainda falta a medição/entrada real ser lançada) */
  async function conferirCombustivel(base: string, chave: string, codigos: string[]) {
    setCombAjuste((p) => ({ ...p, [chave]: { estado: "rodando" } }));
    try {
      const res = await fetch("/api/agentes/painel-erros/combustivel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: base, codigos }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.erro ?? j.error ?? "Falha na conferência");
      setCombAjuste((p) => ({ ...p, [chave]: { estado: "ok", pendentes: j.pendentes, prontos: j.prontos } }));
    } catch (e: any) {
      setCombAjuste((p) => ({ ...p, [chave]: { estado: "erro", erro: e?.message ?? "Falha na conferência" } }));
    }
  }

  // Analisa vários grupos com no máximo 2 investigações ao mesmo tempo
  async function analisarTodos(base: string, planos: { cat: string; causa: string; g: ErroPainel[] }[]) {
    const fila = planos.filter((p) => analises[`${base}|${p.cat}|${p.causa}`]?.estado !== "rodando");
    const worker = async () => {
      for (let p = fila.shift(); p; p = fila.shift()) await analisarGrupo(base, p.cat, p.causa, p.g.map((e) => e.codigo));
    };
    await Promise.all([worker(), worker()]);
  }

  /* gaveta (ajuste em massa: análise por grupo; combustível só pode ser reprocessado) */
  function Gaveta() {
    if (!gaveta) return null;
    const set = new Set(gaveta.codes);
    const itens = todos.filter((e) => set.has(e.codigo));
    const cats = agrupar(itens, "categoria");
    const planos: { cat: string; causa: string; g: ErroPainel[]; somente: boolean }[] = [];
    for (const [cat, its] of cats) for (const [causa, g] of agrupar(its, "causa")) planos.push({ cat, causa, g, somente: g.some((e) => MODOS_SEM_ANALISE.has(e.modo)) });
    const empresas = new Set(itens.map((e) => e.empresa)).size;
    const chaveDe = (p: { cat: string; causa: string }) => `${ativa}|${p.cat}|${p.causa}`;
    const analisaveis = planos.filter((p) => !p.somente);
    const estados = analisaveis.map((p) => analises[chaveDe(p)]?.estado);
    const algumRodando = estados.includes("rodando");
    const feitas = estados.filter((x) => x === "ok").length;
    const pendentes = analisaveis.length - feitas;
    const nomeBase = bases.find((b) => b.id === ativa)?.nome ?? "";
    return (
      <>
        <div className={s.ov} onClick={fecharGaveta} />
        <aside className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="gt">
          <div className={s.dh}>
            <div>
              <span className={s.tag}>Ajuste</span>
              <h2 id="gt">Ajuste em massa</h2>
              <p className={s.sub}>{gaveta.titulo} · {n0(itens.length)} erros · {empresas} {empresas === 1 ? "empresa" : "empresas"} · {cats.length} {cats.length === 1 ? "tipo" : "tipos"}</p>
            </div>
            <button type="button" className={s.btn} onClick={fecharGaveta}>Fechar</button>
          </div>
          <div className={s.db}>
            <div>
              <h3 className={s.h3}>{planos.length} {planos.length === 1 ? "grupo" : "grupos"} nesta seleção</h3>
              <div className={s.plan}>
                {planos.map((p) => {
                  const chave = chaveDe(p);
                  const es = regraDe(p.cat);
                  const IconeModo = ICONE_MODO[es.modo] ?? CircleHelp;
                  const ne = new Set(p.g.map((e) => e.empresa)).size;
                  const an = analises[chave];
                  const rp = reproc[chave];
                  const codigos = p.g.map((e) => e.codigo);
                  const n = codigos.length;
                  const ehComb = p.cat.endsWith("Combustível");
                  const comb = combAjuste[chave];
                  return (
                    <div className={s.item} key={`${p.cat}|${p.causa}`}>
                      <div className={s.itemHead}>
                        <b>{p.cat}</b>
                        <span className={`${s.modoTag} ${es.modo === "elegivel_automatico" ? s.auto : ""}`}><IconeModo size={12} />{es.titulo}</span>
                      </div>
                      <div className={s.meta}>
                        <span>{p.causa}</span>
                        <span className={s.metaCount}>{n0(n)} {n === 1 ? "erro" : "erros"} · {ne} {ne === 1 ? "empresa" : "empresas"}</span>
                      </div>
                      <p className={s.itemDesc}>{es.descricao}</p>

                      <div className={`${s.acoesItem} ${s.acoesTop}`}>
                        {!p.somente && !an && (
                          <button type="button" className={s.btn} onClick={() => analisarGrupo(ativa, p.cat, p.causa, codigos)}>Analisar este grupo</button>
                        )}
                        {ehComb && comb?.estado !== "rodando" && (
                          <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => conferirCombustivel(ativa, chave, codigos)}>
                            <Fuel size={13} /> Conferir saldo real do tanque
                          </button>
                        )}
                        {ehComb && comb?.estado === "rodando" && (
                          <button type="button" className={`${s.btn} ${s.primary}`} disabled><Loader2 size={13} className="animate-spin" /> Conferindo…</button>
                        )}
                        {!rp && (
                          <button type="button" className={(es.modo === "ajustar_pagamento" || es.modo === "ajustar_estoque" || ehComb) ? s.btn : (p.somente ? `${s.btn} ${s.primary}` : s.btn)}
                            onClick={() => setReproc((x) => ({ ...x, [chave]: { estado: "confirmar" } }))}>
                            <RefreshCw size={13} /> Só reprocessar no painel ({n0(n)})
                          </button>
                        )}
                      </div>

                      {ehComb && comb?.estado === "erro" && (
                        <p className={s.aviso2}><XCircle size={13} />{comb.erro}</p>
                      )}
                      {ehComb && comb?.estado === "ok" && (
                        <div className={s.confComb}>
                          {(comb.pendentes?.length ?? 0) === 0 ? (
                            <p className={s.confCombVeredito}><CheckCircle2 size={15} className={s.okIcon} /><span><b>Pode reprocessar</b> — o saldo real do tanque já cobre {n0(n)} {n === 1 ? "código" : "códigos"} selecionado(s).</span></p>
                          ) : (comb.prontos?.length ?? 0) === 0 ? (
                            <p className={s.confCombVeredito}><XCircle size={15} className={s.altoIcon} /><span><b>Ainda não reprocesse</b> — o saldo real do tanque continua insuficiente pra {n0(n)} {n === 1 ? "código" : "códigos"} selecionado(s).</span></p>
                          ) : (
                            <p className={s.confCombVeredito}><AlertTriangle size={15} className={s.medioIcon} /><span><b>Parcial</b> — {n0(comb.prontos?.length ?? 0)} já pode(m) reprocessar, {n0(comb.pendentes?.length ?? 0)} ainda não (saldo insuficiente).</span></p>
                          )}
                          <div className={s.confCombLista}>
                            {comb.prontos?.map((it) => (
                              <div key={`${it.cod_item}-${it.cod_almoxarifado}-ok`} className={s.confCombItem}>
                                <CheckCircle2 size={13} className={s.okIcon} />
                                <span><b>{it.des_almoxarifado}</b> ({it.des_item}): saldo real {n0(it.saldoReal)}, precisa {n0(it.quantidadeNecessaria)} — sobra {n0(Math.abs(it.deficit))} ({it.codigos.length} {it.codigos.length === 1 ? "código" : "códigos"})</span>
                              </div>
                            ))}
                            {comb.pendentes?.map((it) => (
                              <div key={`${it.cod_item}-${it.cod_almoxarifado}-falta`} className={s.confCombItem}>
                                <XCircle size={13} className={s.altoIcon} />
                                <span><b>{it.des_almoxarifado}</b> ({it.des_item}): saldo real {n0(it.saldoReal)}, precisa {n0(it.quantidadeNecessaria)} — falta {n0(it.deficit)} ({it.codigos.length} {it.codigos.length === 1 ? "código" : "códigos"})</span>
                              </div>
                            ))}
                          </div>
                          <p className={s.aviso2}><Info size={13} />Só conferência: nada foi lançado ou alterado no EMSys3. Se estiver pronto, use "Só reprocessar no painel" acima.</p>
                        </div>
                      )}

                      {es.modo === "ajustar_pagamento" && (
                        <AjustePagamentoBloco key={chave} baseId={ativa} codigos={codigos} onAplicado={() => setSujo(true)} />
                      )}

                      {es.modo === "ajustar_estoque" && (
                        <AjusteEstoqueBloco key={chave} baseId={ativa} codigos={codigos} onAplicado={() => setSujo(true)} />
                      )}

                      {rp?.estado === "confirmar" && (
                        <div className={s.confirma}>
                          <span className={s.confirmaMsg}>
                            <AlertTriangle size={15} />
                            Vai marcar <b>{n0(n)}</b> {n === 1 ? "código" : "códigos"} com <span className={s.mono}>reprocessar = true</span> no painel de <b>{nomeBase}</b>.
                            Isso não corrige estoque nem nenhum dado: só devolve os registros ao EMSys Gestão para tentar de novo. Se a causa continuar, os erros voltam.
                          </span>
                          <div className={s.acoesItem}>
                            <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => reprocessarGrupo(ativa, chave, codigos)}>Confirmar: reprocessar {n0(n)}</button>
                            <button type="button" className={s.btn} onClick={() => setReproc((x) => { const c = { ...x }; delete c[chave]; return c; })}>Cancelar</button>
                          </div>
                        </div>
                      )}
                      {rp?.estado === "rodando" && (
                        <div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Marcando no painel…</div>
                      )}
                      {rp?.estado === "ok" && (
                        <div className={s.okBox}>
                          <CheckCircle2 size={15} />
                          <span>
                            <b>{n0(rp.marcados ?? 0)}</b> {(rp.marcados ?? 0) === 1 ? "código marcado" : "códigos marcados"} para reprocessar.
                            {(rp.ignorados ?? 0) > 0 && <> {n0(rp.ignorados ?? 0)} já estavam resolvidos ou reprocessados.</>}
                            {" "}Ao fechar, a lista é atualizada.
                          </span>
                        </div>
                      )}
                      {rp?.estado === "erro" && (
                        <div className={s.analiseErro}>
                          <span className={s.confirmaMsg}><XCircle size={15} />{rp.erro}{(rp.marcados ?? 0) > 0 && <> ({n0(rp.marcados ?? 0)} já foram marcados antes da falha.)</>}</span>
                          <div><button type="button" className={s.btn} onClick={() => setReproc((x) => ({ ...x, [chave]: { estado: "confirmar" } }))}>Tentar de novo</button></div>
                        </div>
                      )}

                      {an?.estado === "rodando" && (
                        <div className={s.andamento}><Loader2 size={14} className="animate-spin" /> Investigando as bases e analisando… costuma levar de 1 a 3 minutos.</div>
                      )}
                      {an?.estado === "erro" && (
                        <div className={s.analiseErro}>
                          <span className={s.confirmaMsg}><XCircle size={15} />{an.erro}</span>
                          <div><button type="button" className={s.btn} onClick={() => analisarGrupo(ativa, p.cat, p.causa, codigos)}>Tentar de novo</button></div>
                        </div>
                      )}
                      {an?.estado === "ok" && an.proposta && (
                        <div className={`${s.resultado} ${s[an.proposta.nivel_risco === "baixo" ? "ok" : an.proposta.nivel_risco === "medio" ? "medio" : "alto"]}`}>
                          <div className={s.resultadoHead}>
                            <b>{an.proposta.titulo}</b>
                            <span className={`${s.pill} ${s[an.proposta.nivel_risco === "baixo" ? "ok" : an.proposta.nivel_risco === "medio" ? "medio" : "alto"]}`}>Risco: {RISCO_LABEL[an.proposta.nivel_risco] ?? an.proposta.nivel_risco}</span>
                          </div>
                          {an.existente && (
                            <p className={s.aviso2}><Info size={13} /> Este erro já tinha uma proposta em aberto: mostrei a existente, sem gastar uma nova análise.</p>
                          )}

                          <div className={s.secTitle}><Lightbulb size={13} /> O que pode ser feito</div>
                          <div className={s.texto}>{an.proposta.correcao_proposta}</div>

                          {an.proposta.sql_correcao ? (
                            <>
                              <div className={s.secTitle}><Code2 size={13} /> SQL de correção</div>
                              <pre className={s.sql}>{an.proposta.sql_correcao}</pre>
                            </>
                          ) : (
                            <p className={s.aviso2}><Info size={13} /> Sem SQL pronto: este grupo exige ação manual ou mais informação, descrita acima.</p>
                          )}

                          <details className={s.detalhes}>
                            <summary>Ver a análise da IA</summary>
                            <div className={s.texto}>{an.proposta.analise}</div>
                          </details>

                          <div className={s.linkProposta}>
                            <span>Proposta <b>{an.proposta.status === "aguardando" ? "Aguardando" : an.proposta.status}</b> criada em Agentes</span>
                            <a href="/painel/intranet/agentes/propostas">Abrir para revisar</a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={s.note}>
              {planos.some((p) => regraDe(p.cat).modo === "somente_reprocessar") && (
                <p><Info size={13} /><span><b>Combustível nunca é ajustado por aqui:</b> não há análise nem SQL, só o reprocessamento do painel.</span></p>
              )}
              {planos.some((p) => regraDe(p.cat).modo === "ajustar_pagamento" || regraDe(p.cat).modo === "ajustar_estoque") && (
                <p><Info size={13} /><span><b>Ajuste de forma de pagamento e de estoque</b> aplicam direto aqui (com prévia antes de confirmar), sem passar por análise de IA nem proposta.</span></p>
              )}
              {planos.some((p) => !MODOS_SEM_ANALISE.has(regraDe(p.cat).modo)) && (
                <p><Info size={13} /><span>A análise investiga as bases reais e cria uma proposta <b>Aguardando</b>; nada é aplicado nesta tela. Uma proposta de SQL reprocessa apenas o código representante ao ser aplicada; para reprocessar o grupo todo use <b>Só reprocessar no painel</b>.</span></p>
              )}
            </div>
          </div>
          <div className={s.df}>
            {analisaveis.length > 0
              ? <span className={s.sub}>{feitas} de {analisaveis.length} analisados</span>
              : <span className={s.sub}>Só reprocessamento disponível nesta seleção</span>}
            <button type="button" className={s.btn} onClick={fecharGaveta}>Fechar</button>
            {analisaveis.length > 0 && (
              <button type="button" className={`${s.btn} ${s.primary}`} disabled={algumRodando || feitas === analisaveis.length} onClick={() => analisarTodos(ativa, analisaveis)}>
                {algumRodando ? "Analisando…" : `Analisar ${pendentes} ${pendentes === 1 ? "grupo" : "grupos"}`}
              </button>
            )}
          </div>
        </aside>
      </>
    );
  }

  useEffect(() => {
    if (!gaveta) return;
    const h = (ev: KeyboardEvent) => { if (ev.key === "Escape") fecharGaveta(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [gaveta, fecharGaveta]);

  const abrirPrimeira = () => setAbertos(new Set(resumo ? [`/${encodeURIComponent(resumo.topo[0])}`] : []));
  // Abre a maior empresa ao carregar uma base (ou ao voltar para uma já carregada)
  useEffect(() => {
    if (atual?.ok && atual.erros.length && abertos.size === 0 && !fEmp) abrirPrimeira();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativa, atual?.geradoEm]);

  const estaCarregando = carregando.has(ativa);
  const hora = atual ? new Date(atual.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const nomeBaseAtiva = bases.find((b) => b.id === ativa)?.nome ?? "";

  return (
    <div className={s.root}>
      {header}
      <div className={s.acoes} style={{ justifyContent: "flex-end" }}>
        <button type="button" className={s.btn} disabled={!ativa} onClick={() => setPadroesAberto(true)}>Padrões desta base</button>
        <button type="button" className={s.btn} disabled={!ativa || estaCarregando} onClick={() => carregar(ativa, true)}>
          {estaCarregando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
        </button>
      </div>
      <PadroesBaseDrawer baseId={ativa} nomeBase={nomeBaseAtiva} aberto={padroesAberto} onFechar={() => setPadroesAberto(false)} />

      {bases.length === 0 ? (
        <div className={s.falha}>
          Nenhuma base com a análise do painel ativada. Cadastre ou edite um cliente em{" "}
          <a href="/painel/intranet/agentes/clientes">Agentes › Clientes</a>.
        </div>
      ) : (
        <>
          {falhaReq[ativa] && <div className={s.falha}><AlertCircle size={14} style={{ display: "inline", marginRight: 6 }} />{falhaReq[ativa]}</div>}
          {atual && !atual.ok && (
            <div className={s.falha}>
              <AlertCircle size={14} style={{ display: "inline", marginRight: 6 }} />
              {atual.erro} <a href="/painel/intranet/agentes/clientes">Ver clientes</a>
            </div>
          )}
          {atual?.ok && atual.avisos.map((a) => <div key={a} className={s.aviso}>{a}</div>)}
          {atual?.ok && atual.truncado && <div className={s.aviso}>Há mais erros pendentes do que o limite lido; a lista mostra os mais recentes.</div>}

          {!atual && estaCarregando && <div className={s.vazio}><Loader2 size={18} className="animate-spin" style={{ display: "inline" }} /> Carregando o painel…</div>}

          {atual?.ok && todos.length === 0 && <div className={`${s.panel} ${s.vazio}`}>Nenhum erro pendente no painel desta base.</div>}

          {atual?.ok && resumo && (
            <>
              <div className={s.kpis}>
                <div className={s.kpi}><small>Erros abertos</small><b>{n0(resumo.total)}</b><span>desde {fmtData(resumo.desde)} · atualizado às {hora}</span></div>
                <div className={s.kpi}><small>Empresas com erro</small><b>{resumo.emps.length}</b><span>{atual.empresasMonitoradas != null ? `de ${atual.empresasMonitoradas} monitoradas` : "nesta base"}</span></div>
                <div className={s.kpi}><small>Tipos de erro</small><b>{resumo.cats.length}</b><span>{resumo.causas} {resumo.causas === 1 ? "causa distinta" : "causas distintas"}</span></div>
                <div className={s.kpi}><small>Maior concentração</small><b>{Math.round((resumo.topo[1].length / resumo.total) * 100)}%</b><span>{resumo.topo[0]}</span></div>
              </div>
              <div className={s.insight}>
                <b>Leitura:</b> {n0(resumo.topCat[1].length)} dos {n0(resumo.total)} erros ({Math.round((resumo.topCat[1].length / resumo.total) * 100)}%) são
                {" "}<b>{resumo.topCat[0]}</b>, em {resumo.causasTop} {resumo.causasTop === 1 ? "causa" : "causas"}.
                {resumo.topCat[0].endsWith("Combustível") && " Combustível não é ajustado pelo painel: corrija o estoque no EMSys3 e use “Só reprocessar no painel”."}
              </div>

              <div className={s.tools}>
                <div className={s.gl}>
                  <span className={s.rotulo}>Agrupar</span>
                  <div className={s.seg} role="group" aria-label="Agrupamento">
                    {PRESETS.map((p) => (
                      <button key={p.id} type="button" aria-pressed={visao === "lista" && p.id === preset}
                        onClick={() => { setPreset(p.id); setVisao("lista"); setAbertos(new Set()); setMais({}); }}>{p.nome}</button>
                    ))}
                  </div>
                </div>
                <div className={s.gr}>
                  <div className={s.seg} role="group" aria-label="Visão">
                    <button type="button" aria-pressed={visao === "lista"} onClick={() => setVisao("lista")}>Lista</button>
                    <button type="button" aria-pressed={visao === "matriz"} onClick={() => setVisao("matriz")}>Matriz</button>
                  </div>
                  <input type="search" className={s.busca} placeholder="Buscar código, caixa, venda…" aria-label="Buscar" value={q} onChange={(ev) => setQ(ev.target.value)} />
                  {visao === "lista" && (
                    <>
                      <button type="button" className={s.btn} onClick={() => setAbertos(new Set(ids(filtrados, 0, "", [])))}>Expandir tudo</button>
                      <button type="button" className={s.btn} onClick={() => setAbertos(new Set())}>Recolher</button>
                    </>
                  )}
                </div>
              </div>

              {(fEmp || fCat) && (
                <div className={s.chips}>
                  {fEmp && <button type="button" className={s.chip} onClick={() => setFEmp(null)}>Empresa: {fEmp} <i aria-hidden="true">×</i></button>}
                  {fCat && <button type="button" className={s.chip} onClick={() => setFCat(null)}>Tipo: {fCat} <i aria-hidden="true">×</i></button>}
                </div>
              )}

              <div className={s.panel}><div className={s.scroller}>{visao === "lista" ? arvore() : matriz()}</div></div>
            </>
          )}
        </>
      )}

      {sel.size > 0 && (
        <div className={s.bar}>
          <div>
            <span><b className={s.num}>{n0(sel.size)}</b> {sel.size === 1 ? "erro selecionado" : "erros selecionados"}</span>
            <button type="button" className={s.btn} onClick={() => setSel(new Set())}>Limpar</button>
            <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => setGaveta({ codes: [...sel], titulo: "Seleção atual" })}>Ajustar em massa…</button>
          </div>
        </div>
      )}

      {Gaveta()}
    </div>
  );
}
