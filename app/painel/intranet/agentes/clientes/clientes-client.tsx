"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Pencil, Trash2, Wifi,
  CheckCircle2, XCircle, Loader2, Database, Eye, EyeOff, Clock,
  Code2, ChevronDown, ChevronUp, ServerCrash, LayoutDashboard,
} from "lucide-react";
import type { AgenteClientePublico, AgenteClienteBasePublico } from "@/agents/core/types";
import { ClienteForm } from "./cliente-form";

interface Props {
  clientes: AgenteClientePublico[];
}

const VAZIO_BASE = {
  nome: "", descricao: "", db_host: "", db_porta: 5432,
  db_nome: "", db_usuario: "", db_senha: "", db_schema: "public", ativo: true,
  papel: "outro" as "emsys" | "outro",
};

export function ClientesClient({ clientes: inicial }: Props) {
  const router = useRouter();
  const [clientes, setClientes] = useState(inicial);

  // ── Form de cliente (AS + EMSys3 juntos)
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<AgenteClientePublico | null>(null);
  const [formKey, setFormKey] = useState(0);

  // ── Outras bases (opcionais) — a base EMSys3 é editada no formulário do cliente
  const [basesAbertas, setBasesAbertas] = useState<Record<string, boolean>>({});
  const [bases, setBases] = useState<Record<string, AgenteClienteBasePublico[]>>({});
  const [basesLoading, setBasesLoading] = useState<Record<string, boolean>>({});
  const [baseForm, setBaseForm] = useState({ ...VAZIO_BASE });
  const [editandoBase, setEditandoBase] = useState<AgenteClienteBasePublico | null>(null);
  const [showBaseForm, setShowBaseForm] = useState<Record<string, boolean>>({});
  const [showBaseSenha, setShowBaseSenha] = useState(false);
  const [erroBase, setErroBase] = useState<string | null>(null);
  const [testeBaseRes, setTesteBaseRes] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [testeFormRes, setTesteFormRes] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Loading / Teste
  const [loading, setLoading] = useState<string | null>(null);
  const [testeRes, setTesteRes] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [vinculoClienteRes, setVinculoClienteRes] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // ── Helpers cliente
  function abrirNovo() {
    setEditando(null);
    setFormKey((k) => k + 1);
    setShowForm(true);
  }

  function abrirEditar(c: AgenteClientePublico) {
    setEditando(c);
    setFormKey((k) => k + 1);
    setShowForm(true);
  }

  function fecharForm() { setShowForm(false); setEditando(null); }

  function aoSalvarCliente(data: AgenteClientePublico) {
    setClientes((cs) => (cs.some((c) => c.id === data.id) ? cs.map((c) => (c.id === data.id ? data : c)) : [data, ...cs]));
    // a lista de bases em cache deste cliente pode ter mudado (EMSys3) — recarrega ao abrir
    setBases((p) => { const n = { ...p }; delete n[data.id]; return n; });
    fecharForm();
  }

  async function handleDeletar(id: string, nome: string) {
    if (!confirm(`Remover o cliente "${nome}"?`)) return;
    setLoading("del-" + id);
    try {
      const res = await fetch(`/api/agentes/clientes/${id}`, { method: "DELETE" });
      if (res.ok) setClientes(clientes.filter((c) => c.id !== id));
    } finally { setLoading(null); }
  }

  async function handleTestar(id: string) {
    setLoading("test-" + id);
    setTesteRes((p) => ({ ...p, [id]: { ok: false, msg: "Testando..." } }));
    try {
      const res = await fetch(`/api/agentes/clientes/${id}/testar`, { method: "POST" });
      const data = await res.json();
      if (data.ok) setTesteRes((p) => ({ ...p, [id]: { ok: true, msg: `Conectado — ${data.banco} (${data.versao})` } }));
      else setTesteRes((p) => ({ ...p, [id]: { ok: false, msg: data.erro ?? "Falha na conexao" } }));
    } catch { setTesteRes((p) => ({ ...p, [id]: { ok: false, msg: "Erro de rede" } })); }
    finally { setLoading(null); }
  }

  // Revalida o vínculo AS x EMSys3 (CNPJ) de um cliente já cadastrado, com as credenciais salvas
  async function handleValidarVinculoCliente(id: string) {
    setLoading("vinculo-" + id);
    setVinculoClienteRes((p) => ({ ...p, [id]: { ok: false, msg: "Validando..." } }));
    try {
      const res = await fetch(`/api/agentes/clientes/${id}/vinculo`, { method: "POST" });
      const data = await res.json();
      setVinculoClienteRes((p) => ({ ...p, [id]: { ok: !!data.ok, msg: data.mensagem ?? data.error ?? "Falha ao validar" } }));
      setClientes((cs) => cs.map((c) => c.id === id
        ? { ...c, vinculo_validado_em: data.vinculo_validado_em ?? null, vinculo_cnpjs: data.vinculo_cnpjs ?? null, vinculo_erro: data.vinculo_erro ?? null }
        : c));
    } catch { setVinculoClienteRes((p) => ({ ...p, [id]: { ok: false, msg: "Erro de rede" } })); }
    finally { setLoading(null); }
  }

  // ── Helpers outras bases
  async function toggleBases(clienteId: string) {
    const abrindo = !basesAbertas[clienteId];
    setBasesAbertas((p) => ({ ...p, [clienteId]: abrindo }));
    if (abrindo && !bases[clienteId]) {
      setBasesLoading((p) => ({ ...p, [clienteId]: true }));
      try {
        const res = await fetch(`/api/agentes/clientes/${clienteId}/bases`);
        const data = await res.json();
        setBases((p) => ({ ...p, [clienteId]: Array.isArray(data) ? data : [] }));
      } catch { setBases((p) => ({ ...p, [clienteId]: [] })); }
      finally { setBasesLoading((p) => ({ ...p, [clienteId]: false })); }
    }
  }

  function abrirNovaBase(clienteId: string) {
    setEditandoBase(null);
    setBaseForm({ ...VAZIO_BASE });
    setShowBaseSenha(false);
    setErroBase(null);
    setTesteFormRes(null);
    setShowBaseForm((p) => ({ ...p, [clienteId]: true }));
  }

  function fecharBaseForm(clienteId: string) {
    setShowBaseForm((p) => ({ ...p, [clienteId]: false }));
    setEditandoBase(null);
    setErroBase(null);
    setTesteFormRes(null);
  }

  function abrirEditarBase(clienteId: string, b: AgenteClienteBasePublico) {
    setEditandoBase(b);
    setBaseForm({
      nome: b.nome, descricao: b.descricao ?? "",
      db_host: b.db_host, db_porta: b.db_porta,
      db_nome: b.db_nome, db_usuario: b.db_usuario,
      db_senha: b.db_senha, db_schema: b.db_schema, ativo: b.ativo, papel: b.papel,
    });
    setShowBaseSenha(false);
    setErroBase(null);
    setTesteFormRes(null);
    setShowBaseForm((p) => ({ ...p, [clienteId]: true }));
  }

  async function handleSalvarBase(clienteId: string) {
    if (!baseForm.nome || !baseForm.db_host || !baseForm.db_nome || !baseForm.db_usuario) {
      setErroBase("Preencha todos os campos obrigatorios."); return;
    }
    if (!editandoBase && !baseForm.db_senha) {
      setErroBase("Informe a senha do banco."); return;
    }
    setLoading("base-salvar-" + clienteId); setErroBase(null);
    try {
      const method = editandoBase ? "PUT" : "POST";
      const url = editandoBase
        ? `/api/agentes/clientes/${clienteId}/bases/${editandoBase.id}`
        : `/api/agentes/clientes/${clienteId}/bases`;
      const body: any = { ...baseForm, papel: "outro" };
      if (editandoBase && body.db_senha === "••••••••") delete body.db_senha;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErroBase(data.error); return; }
      if (editandoBase) {
        setBases((p) => ({ ...p, [clienteId]: p[clienteId]?.map((b) => b.id === editandoBase.id ? data : b) ?? [] }));
      } else {
        setBases((p) => ({ ...p, [clienteId]: [...(p[clienteId] ?? []), data] }));
      }
      fecharBaseForm(clienteId);
    } catch { setErroBase("Erro de comunicacao."); }
    finally { setLoading(null); }
  }

  async function handleDeletarBase(clienteId: string, baseId: string, nome: string) {
    if (!confirm(`Remover a base "${nome}"?`)) return;
    setLoading("base-del-" + baseId);
    try {
      const res = await fetch(`/api/agentes/clientes/${clienteId}/bases/${baseId}`, { method: "DELETE" });
      if (res.ok) setBases((p) => ({ ...p, [clienteId]: p[clienteId]?.filter((b) => b.id !== baseId) ?? [] }));
    } finally { setLoading(null); }
  }

  async function handleTestarBase(clienteId: string, baseId: string) {
    const key = `${clienteId}-${baseId}`;
    setLoading("base-test-" + key);
    setTesteBaseRes((p) => ({ ...p, [key]: { ok: false, msg: "Testando..." } }));
    try {
      const res = await fetch(`/api/agentes/clientes/${clienteId}/bases/${baseId}/testar`, { method: "POST" });
      const data = await res.json();
      if (data.ok) setTesteBaseRes((p) => ({ ...p, [key]: { ok: true, msg: `Conectado — ${data.banco} (${data.versao})` } }));
      else setTesteBaseRes((p) => ({ ...p, [key]: { ok: false, msg: data.erro ?? "Falha na conexao" } }));
    } catch { setTesteBaseRes((p) => ({ ...p, [key]: { ok: false, msg: "Erro de rede" } })); }
    finally { setLoading(null); }
  }

  async function handleTestarFormBase() {
    if (!baseForm.db_host || !baseForm.db_nome || !baseForm.db_usuario) {
      setTesteFormRes({ ok: false, msg: "Preencha Host, Banco e Usuário antes de testar." }); return;
    }
    if (!baseForm.db_senha || baseForm.db_senha === "••••••••") {
      setTesteFormRes({ ok: false, msg: "Informe a senha para testar." }); return;
    }
    setLoading("base-test-form");
    setTesteFormRes({ ok: false, msg: "Testando..." });
    try {
      const res = await fetch("/api/agentes/testar-conexao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_host: baseForm.db_host, db_porta: baseForm.db_porta,
          db_nome: baseForm.db_nome, db_usuario: baseForm.db_usuario, db_senha: baseForm.db_senha,
        }),
      });
      const data = await res.json();
      if (data.ok) setTesteFormRes({ ok: true, msg: `Conectado — ${data.banco} (${data.versao})` });
      else setTesteFormRes({ ok: false, msg: data.erro ?? "Falha na conexao" });
    } catch { setTesteFormRes({ ok: false, msg: "Erro de rede" }); }
    finally { setLoading(null); }
  }

  const fieldBase = (key: keyof typeof VAZIO_BASE, label: string, opts?: {
    type?: string; placeholder?: string; required?: boolean;
  }) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 4, opacity: 0.65 }}>
        {label}{opts?.required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <input
        type={opts?.type ?? "text"}
        value={String(baseForm[key])}
        onChange={(e) => setBaseForm((p) => ({ ...p, [key]: opts?.type === "number" ? Number(e.target.value) : e.target.value }))}
        placeholder={opts?.placeholder}
        style={{ width: "100%", padding: "6px 9px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)", fontSize: 12, boxSizing: "border-box" }}
      />
    </div>
  );

  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => router.push("/painel/intranet/agentes")}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}
          >
            <ArrowLeft size={13} /> Voltar
          </button>
          <Database size={18} style={{ opacity: 0.6 }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Clientes do Agente</h1>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.5 }}>Cada cliente tem a base AS e a base EMSys3, sempre do mesmo CNPJ</p>
          </div>
        </div>
        <button
          onClick={abrirNovo}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
        >
          <Plus size={14} /> Adicionar Cliente
        </button>
      </div>

      {/* Formulário único: cliente + base AS + base EMSys3 */}
      {showForm && (
        <ClienteForm key={formKey} editando={editando} onCancel={fecharForm} onSaved={aoSalvarCliente} />
      )}

      {/* Lista de clientes */}
      {clientes.length === 0 && !showForm ? (
        <div style={{ textAlign: "center", padding: "60px 20px", opacity: 0.45 }}>
          <Database size={36} style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 14, margin: 0 }}>Nenhum cliente cadastrado</p>
          <p style={{ fontSize: 12, margin: "4px 0 0" }}>Adicione um cliente para o agente saber qual base analisar</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {clientes.map((c) => {
            const teste = testeRes[c.id];
            const basesExpandidas = basesAbertas[c.id];
            const listabases = (bases[c.id] ?? []).filter((b) => b.papel !== "emsys");
            const carregandoBases = basesLoading[c.id];
            const baseFormAberto = showBaseForm[c.id];

            return (
              <div key={c.id} style={{ borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", overflow: "hidden" }}>
                {/* Info principal */}
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{c.nome}</span>
                        <span style={{ fontSize: 11, opacity: 0.5, background: "#00000008", padding: "1px 8px", borderRadius: 20, border: "1px solid var(--border, #e5e7eb)" }}>{c.slug}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 500, padding: "1px 8px", borderRadius: 20,
                          background: c.ativo ? "#22c55e18" : "#e5e7eb",
                          color: c.ativo ? "#15803d" : "#6b7280",
                        }}>
                          {c.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, opacity: 0.55, fontFamily: "monospace" }}>
                        AS: {c.db_host}:{c.db_porta} / {c.db_nome}
                        {c.db_schema !== "public" && ` (${c.db_schema})`}
                        &nbsp;· {c.db_usuario}
                      </p>
                      <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                        {c.analise_painel ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6366f1", padding: "1px 7px", borderRadius: 20, background: "#6366f110" }}>
                            <LayoutDashboard size={10} /> Painel EMSys Gestão ativo
                          </span>
                        ) : c.query_erros ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#4f46e5", padding: "1px 7px", borderRadius: 20, background: "#6366f110" }}>
                            <Code2 size={10} /> Query configurada
                          </span>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9ca3af", padding: "1px 7px", borderRadius: 20, background: "#f3f4f6" }}>
                            <Code2 size={10} /> Sem varredura ativa
                          </span>
                        )}
                        {c.ultimo_scan && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, opacity: 0.5 }}>
                            <Clock size={10} /> {new Date(c.ultimo_scan).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>

                      {/* Vínculo AS x EMSys3 (CNPJ) */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginTop: 6, fontSize: 12, lineHeight: 1.4, color: c.vinculo_validado_em ? "#15803d" : "#b91c1c" }}>
                        {c.vinculo_validado_em ? <CheckCircle2 size={12} style={{ flexShrink: 0, marginTop: 2 }} /> : <XCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />}
                        <span>
                          {c.vinculo_validado_em
                            ? `AS × EMSys3 validado (CNPJ raiz ${c.vinculo_cnpjs ?? "—"}) em ${new Date(c.vinculo_validado_em).toLocaleString("pt-BR")}`
                            : `AS × EMSys3 NÃO validado — o agente não opera neste cliente. ${c.vinculo_erro ?? "Clique em Validar vínculo."}`}
                        </span>
                      </div>
                      {vinculoClienteRes[c.id] && (
                        <p style={{ margin: "3px 0 0", fontSize: 11, color: vinculoClienteRes[c.id].ok ? "#15803d" : "#b91c1c" }}>{vinculoClienteRes[c.id].msg}</p>
                      )}
                      {c.notas && <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.5 }}>{c.notas}</p>}
                      {teste && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 12, color: teste.ok ? "#15803d" : "#b91c1c" }}>
                          {teste.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {teste.msg}
                        </div>
                      )}
                    </div>

                    {/* Ações */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => handleValidarVinculoCliente(c.id)} disabled={loading === "vinculo-" + c.id} title="Conferir CNPJ entre a base AS e a base EMSys3"
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid #6366f150", background: "transparent", color: "#4f46e5", cursor: "pointer", fontSize: 12 }}>
                        {loading === "vinculo-" + c.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Validar vínculo
                      </button>
                      <button onClick={() => handleTestar(c.id)} disabled={loading === "test-" + c.id} title="Testar conexao do AS"
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 12 }}>
                        {loading === "test-" + c.id ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
                        Testar
                      </button>
                      <button onClick={() => abrirEditar(c)} title="Editar cliente e bases"
                        style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer" }}>
                        <Pencil size={13} style={{ opacity: 0.6 }} />
                      </button>
                      <button onClick={() => handleDeletar(c.id, c.nome)} disabled={loading === "del-" + c.id} title="Remover"
                        style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #ef444430", background: "transparent", cursor: "pointer" }}>
                        {loading === "del-" + c.id
                          ? <Loader2 size={13} className="animate-spin" style={{ color: "#ef4444" }} />
                          : <Trash2 size={13} style={{ color: "#ef4444" }} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Outras bases (opcionais) */}
                <div style={{ borderTop: "1px solid var(--border, #e5e7eb)" }}>
                  <button
                    onClick={() => toggleBases(c.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ServerCrash size={12} style={{ color: "#6366f1", opacity: 0.7 }} />
                      <strong style={{ color: "#374151" }}>Outras bases (opcional)</strong>
                      <span style={{ opacity: 0.5 }}>— a base EMSys3 é editada no botão de editar do cliente</span>
                    </span>
                    {basesExpandidas ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {basesExpandidas && (
                    <div style={{ padding: "0 18px 16px" }}>
                      {carregandoBases ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.5, padding: "8px 0" }}>
                          <Loader2 size={12} className="animate-spin" /> Carregando...
                        </div>
                      ) : (
                        <>
                          {listabases.length === 0 && !baseFormAberto && (
                            <p style={{ fontSize: 12, opacity: 0.45, margin: "0 0 10px" }}>
                              Nenhuma outra base. Só adicione se o agente precisar consultar um banco além do AS e do EMSys3.
                            </p>
                          )}

                          {listabases.map((b) => {
                            const testeKey = `${c.id}-${b.id}`;
                            const testeBase = testeBaseRes[testeKey];
                            return (
                              <div key={b.id} style={{ borderRadius: 8, background: "#f9fafb", marginBottom: 6, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px" }}>
                                  <div>
                                    <span style={{ fontSize: 13, fontWeight: 500 }}>{b.nome}</span>
                                    {b.descricao && <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 8 }}>{b.descricao}</span>}
                                    <p style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.5, fontFamily: "monospace" }}>
                                      {b.db_host}:{b.db_porta} / {b.db_nome} · {b.db_usuario}
                                    </p>
                                  </div>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button onClick={() => handleTestarBase(c.id, b.id)}
                                      disabled={loading === "base-test-" + testeKey} title="Testar conexão"
                                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer", fontSize: 11 }}>
                                      {loading === "base-test-" + testeKey ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}
                                      Testar
                                    </button>
                                    <button onClick={() => abrirEditarBase(c.id, b)}
                                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer" }}>
                                      <Pencil size={11} style={{ opacity: 0.5 }} />
                                    </button>
                                    <button onClick={() => handleDeletarBase(c.id, b.id, b.nome)}
                                      disabled={loading === "base-del-" + b.id}
                                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #ef444420", background: "white", cursor: "pointer" }}>
                                      {loading === "base-del-" + b.id
                                        ? <Loader2 size={11} className="animate-spin" style={{ color: "#ef4444" }} />
                                        : <Trash2 size={11} style={{ color: "#ef4444" }} />}
                                    </button>
                                  </div>
                                </div>
                                {testeBase && (
                                  <div style={{ padding: "4px 12px 8px", display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: testeBase.ok ? "#15803d" : "#b91c1c" }}>
                                    {testeBase.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                                    {testeBase.msg}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {baseFormAberto ? (
                            <div style={{ padding: "14px", borderRadius: 10, border: "1px solid #6366f130", background: "#fafafa", marginTop: 8 }}>
                              <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>
                                {editandoBase ? `Editar: ${editandoBase.nome}` : "Nova base de investigação"}
                              </p>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
                                {fieldBase("nome", "Nome da base", { required: true })}
                                {fieldBase("descricao", "Descrição")}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 14px" }}>
                                {fieldBase("db_host", "Host", { required: true })}
                                {fieldBase("db_porta", "Porta", { type: "number", required: true })}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px" }}>
                                {fieldBase("db_nome", "Banco", { required: true })}
                                {fieldBase("db_usuario", "Usuário", { required: true })}
                                {fieldBase("db_schema", "Schema")}
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 4, opacity: 0.65 }}>
                                  Senha{!editandoBase && <span style={{ color: "#ef4444" }}> *</span>}
                                  {editandoBase && <span style={{ opacity: 0.5 }}> (em branco = manter)</span>}
                                </label>
                                <div style={{ position: "relative" }}>
                                  <input
                                    type={showBaseSenha ? "text" : "password"}
                                    value={baseForm.db_senha}
                                    onChange={(e) => setBaseForm((p) => ({ ...p, db_senha: e.target.value }))}
                                    placeholder={editandoBase ? "••••••••" : "Senha"}
                                    style={{ width: "100%", padding: "6px 30px 6px 9px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)", fontSize: 12, boxSizing: "border-box" }}
                                  />
                                  <button type="button" onClick={() => setShowBaseSenha((v) => !v)}
                                    style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.45 }}>
                                    {showBaseSenha ? <EyeOff size={12} /> : <Eye size={12} />}
                                  </button>
                                </div>
                              </div>
                              {erroBase && <p style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>{erroBase}</p>}
                              {testeFormRes && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, marginBottom: 8, color: testeFormRes.ok ? "#15803d" : "#b91c1c" }}>
                                  {testeFormRes.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                  {testeFormRes.msg}
                                </div>
                              )}
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => handleSalvarBase(c.id)}
                                  disabled={loading === "base-salvar-" + c.id}
                                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 7, border: "none", background: "#6366f1", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                                  {loading === "base-salvar-" + c.id && <Loader2 size={11} className="animate-spin" />}
                                  {loading === "base-salvar-" + c.id ? "Salvando..." : "Salvar base"}
                                </button>
                                <button onClick={handleTestarFormBase}
                                  disabled={loading === "base-test-form"}
                                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer", fontSize: 12 }}>
                                  {loading === "base-test-form" ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}
                                  Testar conexão
                                </button>
                                <button onClick={() => fecharBaseForm(c.id)}
                                  style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", background: "white", cursor: "pointer", fontSize: 12 }}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => abrirNovaBase(c.id)}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px dashed #6366f160", background: "transparent", cursor: "pointer", fontSize: 12, color: "#6366f1", marginTop: 4 }}>
                              <Plus size={12} /> Adicionar base
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
