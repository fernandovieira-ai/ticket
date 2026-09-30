"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, ClipboardList, Database, History, Loader2, RefreshCw, Settings } from "lucide-react";
import type { PainelErrosBase } from "@/agents/core/painel-erros";
import s from "./painel-erros.module.css";
import h from "./painel-home.module.css";

interface BaseInfo { id: string; nome: string }

const n0 = (n: number) => n.toLocaleString("pt-BR");

function agrupar<T>(itens: T[], chave: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of itens) { const k = chave(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}

/**
 * Tela principal dos Agentes: um card por base que TEM erro pendente no painel EMSys Gestão.
 * Base sem erro não aparece. Clicar no card abre o painel completo da base em página própria (com Voltar).
 */
export function PainelHome({ bases, aguardando }: { bases: BaseInfo[]; aguardando: number }) {
  const router = useRouter();
  const [dados, setDados] = useState<Record<string, PainelErrosBase>>({});
  const [falhas, setFalhas] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState<Set<string>>(new Set());

  const carregar = useCallback(async (id: string, forcar = false) => {
    setCarregando((p) => new Set(p).add(id));
    try {
      const res = await fetch(`/api/agentes/painel-erros?cliente_id=${id}${forcar ? "&forcar=1" : ""}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setDados((p) => ({ ...p, [id]: j }));
      setFalhas((p) => { const n = { ...p }; delete n[id]; return n; });
    } catch (e: any) {
      setFalhas((p) => ({ ...p, [id]: e?.message ?? "Falha ao carregar" }));
    } finally {
      setCarregando((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  }, []);

  useEffect(() => { bases.forEach((b) => carregar(b.id)); }, [bases, carregar]);

  const carregandoAlgum = carregando.size > 0;
  // Só bases COM erro; base que falhou ao carregar aparece como aviso (senão o problema ficaria invisível)
  const comErro = bases.filter((b) => dados[b.id]?.ok && dados[b.id].erros.length > 0);
  const comFalha = bases.filter((b) => !carregando.has(b.id) && (falhas[b.id] || (dados[b.id] && !dados[b.id].ok)));
  const primeiraCarga = bases.length > 0 && bases.every((b) => !dados[b.id] && !falhas[b.id]);

  const btn = s.btn;
  return (
    <div className={s.root}>
      <div className={s.top}>
        <div className={s.titulo}>
          <div className={s.icone}><Bot size={22} style={{ color: "var(--nav-active-text, #0E1326)" }} /></div>
          <div>
            <h1 className={s.h1}>Agentes IA</h1>
            <p className={s.sub}>Erros pendentes no painel EMSys Gestão, por base</p>
          </div>
        </div>
        <div className={s.acoes}>
          <button type="button" className={btn} onClick={() => router.push("/painel/intranet/agentes/propostas")}>
            <ClipboardList size={14} /> Propostas{aguardando > 0 && <span className={`${s.badge} ${s.alerta}`}>{aguardando}</span>}
          </button>
          <button type="button" className={btn} onClick={() => router.push("/painel/intranet/agentes/clientes")}><Database size={14} /> Clientes</button>
          <button type="button" className={btn} onClick={() => router.push("/painel/intranet/agentes/config")}><Settings size={14} /> Configurar</button>
          <button type="button" className={btn} onClick={() => router.push("/painel/intranet/agentes/historico")}><History size={14} /> Histórico</button>
          <button type="button" className={btn} disabled={carregandoAlgum || bases.length === 0} onClick={() => bases.forEach((b) => carregar(b.id, true))}>
            {carregandoAlgum ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
          </button>
        </div>
      </div>

      {bases.length === 0 && (
        <div className={s.falha}>
          Nenhuma base com a análise do painel ativada. Cadastre ou edite um cliente em{" "}
          <a href="/painel/intranet/agentes/clientes">Agentes › Clientes</a>.
        </div>
      )}

      {primeiraCarga && <div className={s.vazio}><Loader2 size={18} className="animate-spin" style={{ display: "inline" }} /> Carregando o painel…</div>}

      {(comErro.length > 0 || comFalha.length > 0) && (
        <div className={h.grade}>
          {comErro.map((b) => {
            const d = dados[b.id];
            const emps = agrupar(d.erros, (e) => e.empresa);
            const tipos = agrupar(d.erros, (e) => e.categoria);
            const topo = emps[0];
            const hora = new Date(d.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            return (
              <button key={b.id} type="button" className={h.card} onClick={() => router.push(`/painel/intranet/agentes/painel/${b.id}`)} aria-label={`Abrir o painel de erros de ${b.nome}`}>
                <div className={h.cardTopo}>
                  <span className={h.cardNome}>{b.nome}</span>
                  <span className={h.cardNum}>{n0(d.erros.length)}</span>
                </div>
                <span className={h.cardLegenda}>{d.erros.length === 1 ? "erro pendente no painel" : "erros pendentes no painel"}</span>
                <div className={h.cardLinhas}>
                  <span><b>{emps.length}</b> {emps.length === 1 ? "empresa com erro" : "empresas com erro"}{d.empresasMonitoradas != null && ` de ${d.empresasMonitoradas}`}</span>
                  <span><b>{tipos.length}</b> {tipos.length === 1 ? "tipo de erro" : "tipos de erro"}</span>
                  <span>Maior concentração: <b>{Math.round((topo[1].length / d.erros.length) * 100)}%</b> · {topo[0]}</span>
                </div>
                <div className={h.cardRodape}>
                  <span>atualizado às {hora}</span>
                  <span className={h.cardAbrir}>Abrir painel</span>
                </div>
              </button>
            );
          })}
          {comFalha.map((b) => (
            <div key={b.id} className={`${h.card} ${h.cardFalha}`}>
              <div className={h.cardTopo}><span className={h.cardNome}>{b.nome}</span><AlertCircle size={18} style={{ color: "var(--medio)" }} /></div>
              <span className={h.cardLegenda}>Não foi possível ler o painel desta base</span>
              <span style={{ fontSize: 13 }}>{falhas[b.id] ?? dados[b.id]?.erro}</span>
              <div className={h.cardRodape}><a href="/painel/intranet/agentes/clientes" style={{ textDecoration: "underline" }}>Ver clientes</a></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
