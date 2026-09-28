"use client";

import { useEffect, useState } from "react";
import {
  Loader2, Wifi, CheckCircle2, XCircle, Eye, EyeOff, ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";
import type { AgenteClientePublico } from "@/agents/core/types";

const MASCARA = "••••••••";

type Conexao = {
  db_host: string; db_porta: number; db_nome: string;
  db_usuario: string; db_senha: string; db_schema: string;
};

const CONEXAO_VAZIA: Conexao = {
  db_host: "", db_porta: 5432, db_nome: "", db_usuario: "", db_senha: "", db_schema: "public",
};

type Teste = { ok: boolean; msg: string } | null;

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 7,
  border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box", background: "white",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 };
const req = <span style={{ color: "#ef4444" }}> *</span>;

interface BlocoProps {
  numero: number;
  titulo: string;
  descricao: string;
  valor: Conexao;
  onChange: (patch: Partial<Conexao>) => void;
  editando: boolean;
  onTestar: () => void;
  testando: boolean;
  teste: Teste;
  children?: React.ReactNode;
}

// Bloco de conexão reutilizado para o AS e para o EMSys3 — mesma aparência, um abaixo do outro
function BlocoBase({ numero, titulo, descricao, valor, onChange, editando, onTestar, testando, teste, children }: BlocoProps) {
  const [verSenha, setVerSenha] = useState(false);
  return (
    <div style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "#fafbff", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ width: 24, height: 24, borderRadius: 12, background: "#6366f1", color: "white", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {numero}
        </span>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{titulo}</p>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.55 }}>{descricao}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: "0 14px", marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Host{req}</label>
          <input style={inputStyle} value={valor.db_host} onChange={(e) => onChange({ db_host: e.target.value })} placeholder="Ex: cloud.grupoosprey.com.br" />
        </div>
        <div>
          <label style={labelStyle}>Porta{req}</label>
          <input style={inputStyle} type="number" value={valor.db_porta} onChange={(e) => onChange({ db_porta: Number(e.target.value) })} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px", marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Banco{req}</label>
          <input style={inputStyle} value={valor.db_nome} onChange={(e) => onChange({ db_nome: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Usuário{req}</label>
          <input style={inputStyle} value={valor.db_usuario} onChange={(e) => onChange({ db_usuario: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Senha{!editando && req}</label>
          <div style={{ position: "relative" }}>
            <input
              style={{ ...inputStyle, paddingRight: 34 }}
              type={verSenha ? "text" : "password"}
              value={valor.db_senha}
              onChange={(e) => onChange({ db_senha: e.target.value })}
              placeholder={editando ? "(manter)" : "Senha"}
            />
            <button type="button" onClick={() => setVerSenha((v) => !v)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.5 }}>
              {verSenha ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>

      {children}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={onTestar} disabled={testando}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: "1px solid #6366f180", background: "white", color: "#4f46e5", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
          {testando ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
          Testar conexão
        </button>
        {teste && (
          <span style={{ display: "flex", alignItems: "flex-start", gap: 5, fontSize: 12, lineHeight: 1.4, color: teste.ok ? "#15803d" : teste.msg === "Testando..." ? "#6b7280" : "#b91c1c" }}>
            {teste.ok ? <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} /> : teste.msg === "Testando..." ? null : <XCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />}
            {teste.msg}
          </span>
        )}
      </div>
    </div>
  );
}

interface Props {
  editando: AgenteClientePublico | null;
  onCancel: () => void;
  onSaved: (cliente: AgenteClientePublico) => void;
}

export function ClienteForm({ editando, onCancel, onSaved }: Props) {
  const [nome, setNome] = useState(editando?.nome ?? "");
  const [slug, setSlug] = useState(editando?.slug ?? "");
  const [slugManual, setSlugManual] = useState(!!editando);
  const [ativo, setAtivo] = useState(editando?.ativo ?? true);
  const [notas, setNotas] = useState(editando?.notas ?? "");
  const [analisePainel, setAnalisePainel] = useState(editando ? !!editando.analise_painel : true);
  const [queryErros, setQueryErros] = useState(editando?.query_erros ?? "");

  const [as, setAs] = useState<Conexao>(
    editando
      ? { db_host: editando.db_host, db_porta: editando.db_porta, db_nome: editando.db_nome, db_usuario: editando.db_usuario, db_senha: MASCARA, db_schema: editando.db_schema }
      : { ...CONEXAO_VAZIA },
  );
  const [emsys, setEmsys] = useState<Conexao>({ ...CONEXAO_VAZIA });
  const [emsysNome, setEmsysNome] = useState("EMSys3");
  const [carregandoEmsys, setCarregandoEmsys] = useState(!!editando);
  const [emsysExistia, setEmsysExistia] = useState(false);

  const [avancado, setAvancado] = useState(false);
  const [testando, setTestando] = useState<"as" | "emsys" | null>(null);
  const [teste, setTeste] = useState<{ as: Teste; emsys: Teste }>({ as: null, emsys: null });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Em edição, carrega a base EMSys3 já cadastrada para o mesmo formulário
  useEffect(() => {
    if (!editando) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/agentes/clientes/${editando.id}/bases`);
        const data = await res.json();
        const b = Array.isArray(data) ? data.find((x: any) => x.papel === "emsys") : null;
        if (vivo && b) {
          setEmsys({ db_host: b.db_host, db_porta: b.db_porta, db_nome: b.db_nome, db_usuario: b.db_usuario, db_senha: MASCARA, db_schema: b.db_schema });
          setEmsysNome(b.nome);
          setEmsysExistia(true);
        }
      } finally { if (vivo) setCarregandoEmsys(false); }
    })();
    return () => { vivo = false; };
  }, [editando]);

  function mudarNome(v: string) {
    setNome(v);
    if (!slugManual) setSlug(slugify(v));
  }

  async function testar(alvo: "as" | "emsys") {
    const c = alvo === "as" ? as : emsys;
    const rotulo = alvo === "as" ? "AS" : "EMSys3";
    const emEdicao = !!editando && (alvo === "as" || emsysExistia);
    if (!c.db_host || !c.db_nome || !c.db_usuario) {
      setTeste((p) => ({ ...p, [alvo]: { ok: false, msg: `Preencha host, banco e usuário do ${rotulo}.` } })); return;
    }
    if (!c.db_senha || (c.db_senha === MASCARA && !emEdicao)) {
      setTeste((p) => ({ ...p, [alvo]: { ok: false, msg: `Informe a senha do ${rotulo}.` } })); return;
    }
    setTestando(alvo);
    setTeste((p) => ({ ...p, [alvo]: { ok: false, msg: "Testando..." } }));
    try {
      const res = await fetch("/api/agentes/testar-conexao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, esperado: alvo, cliente_id: editando?.id }),
      });
      const data = await res.json();
      setTeste((p) => ({
        ...p,
        [alvo]: data.ok
          ? { ok: true, msg: `Conectado — ${data.banco} (${data.versao})${data.aviso ? ` · ${data.aviso}` : ""}` }
          : { ok: false, msg: data.erro ?? data.error ?? "Falha na conexão" },
      }));
    } catch { setTeste((p) => ({ ...p, [alvo]: { ok: false, msg: "Erro de rede" } })); }
    finally { setTestando(null); }
  }

  async function salvar() {
    setErro(null);
    if (!nome.trim() || !slug.trim()) { setErro("Informe o nome do cliente."); return; }
    for (const [rotulo, c] of [["AS", as], ["EMSys3", emsys]] as const) {
      if (!c.db_host || !c.db_nome || !c.db_usuario) { setErro(`Preencha host, banco e usuário da base ${rotulo}.`); return; }
    }
    if (!editando && (!as.db_senha || !emsys.db_senha)) { setErro("Informe a senha das duas bases."); return; }
    if (editando && !emsysExistia && !emsys.db_senha) { setErro("Informe a senha da base EMSys3."); return; }

    setSalvando(true);
    try {
      const body: any = {
        nome: nome.trim(), slug, ativo, notas,
        analise_painel: analisePainel,
        query_erros: analisePainel ? "" : queryErros,
        ...as,
        emsys: { nome: emsysNome, ...emsys },
      };
      if (editando) {
        if (!body.db_senha || body.db_senha === MASCARA) delete body.db_senha;
        if (!body.emsys.db_senha || body.emsys.db_senha === MASCARA) delete body.emsys.db_senha;
      }
      const res = await fetch(editando ? `/api/agentes/clientes/${editando.id}` : "/api/agentes/clientes", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error ?? "Erro ao salvar"); return; }
      onSaved(data);
    } catch { setErro("Erro de comunicação. Tente novamente."); }
    finally { setSalvando(false); }
  }

  const erroVinculo = erro && /CNPJ|vínculo|mesmo banco|já está cadastrado/i.test(erro);

  return (
    <div style={{ padding: 20, borderRadius: 12, border: "1px solid #6366f140", background: "var(--card-bg, white)", marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
        {editando ? `Editar: ${editando.nome}` : "Novo cliente"}
      </h3>

      {/* Identificação */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 14px", marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Nome do cliente{req}</label>
          <input style={inputStyle} value={nome} onChange={(e) => mudarNome(e.target.value)} placeholder="Ex: Dunapetro" />
        </div>
        <div>
          <label style={labelStyle}>Identificador{req}</label>
          <input style={inputStyle} value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugManual(true); }} placeholder="gerado pelo nome" />
        </div>
      </div>

      {/* Base 1 — AS */}
      <BlocoBase
        numero={1} titulo="Base AS" descricao="De onde o agente lê os erros (painel EMSys Gestão)"
        valor={as} onChange={(p) => setAs((v) => ({ ...v, ...p }))} editando={!!editando}
        onTestar={() => testar("as")} testando={testando === "as"} teste={teste.as}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={analisePainel} onChange={(e) => setAnalisePainel(e.target.checked)} style={{ accentColor: "#6366f1" }} />
          Analisar o painel EMSys Gestão automaticamente (<code>exchange_emsys_gestao_monitoramento_pend</code>)
        </label>
      </BlocoBase>

      {/* Base 2 — EMSys3 */}
      {carregandoEmsys ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.6, marginBottom: 14 }}>
          <Loader2 size={12} className="animate-spin" /> Carregando base EMSys3...
        </div>
      ) : (
        <BlocoBase
          numero={2} titulo="Base EMSys3" descricao="Banco onde o agente investiga e aplica as correções"
          valor={emsys} onChange={(p) => setEmsys((v) => ({ ...v, ...p }))} editando={!!editando && emsysExistia}
          onTestar={() => testar("emsys")} testando={testando === "emsys"} teste={teste.emsys}
        />
      )}

      {/* Aviso do vínculo por CNPJ + erro do salvamento */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 12, lineHeight: 1.45,
        background: erroVinculo ? "#fef2f2" : "#f0fdf4", border: `1px solid ${erroVinculo ? "#fecaca" : "#bbf7d0"}`, color: erroVinculo ? "#b91c1c" : "#166534" }}>
        {erroVinculo ? <XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
        <span>
          {erroVinculo
            ? erro
            : "Ao salvar, o sistema confere se os CNPJs das empresas ativas do EMSys3 (tab_empresa, ind_ativo = S) existem no AS (empresa × pessoa). Se não baterem, nada é salvo — isso impede misturar bases de clientes diferentes."}
        </span>
      </div>

      {/* Opções avançadas */}
      <button type="button" onClick={() => setAvancado((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", padding: 0, marginBottom: 10 }}>
        {avancado ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Opções avançadas
      </button>
      {avancado && (
        <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border, #e5e7eb)", marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px", marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Schema do AS</label>
              <input style={inputStyle} value={as.db_schema} onChange={(e) => setAs((v) => ({ ...v, db_schema: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Schema do EMSys3</label>
              <input style={inputStyle} value={emsys.db_schema} onChange={(e) => setEmsys((v) => ({ ...v, db_schema: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Nome da base EMSys3</label>
              <input style={inputStyle} value={emsysNome} onChange={(e) => setEmsysNome(e.target.value)} />
            </div>
          </div>
          {!analisePainel && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Query de erros (SQL) — executada na varredura automática</label>
              <textarea value={queryErros} onChange={(e) => setQueryErros(e.target.value)} rows={4} spellCheck={false}
                placeholder={"SELECT descricao, contexto, stack\nFROM log_erros\nWHERE resolvido = FALSE\nLIMIT 50"}
                style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, resize: "vertical" }} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Notas</label>
            <input style={inputStyle} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observações sobre este cliente" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} style={{ accentColor: "#6366f1" }} />
            Cliente ativo
          </label>
        </div>
      )}

      {erro && !erroVinculo && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 10px" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={salvar} disabled={salvando || carregandoEmsys}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: salvando ? 0.8 : 1 }}>
          {salvando && <Loader2 size={13} className="animate-spin" />}
          {salvando ? "Conferindo CNPJ e salvando..." : "Salvar cliente"}
        </button>
        <button onClick={onCancel} disabled={salvando}
          style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
