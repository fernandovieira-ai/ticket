"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Pencil, Trash2, Wifi,
  CheckCircle2, XCircle, Loader2, Database, Eye, EyeOff, Clock,
  Code2, ChevronDown, ChevronUp, ServerCrash, LayoutDashboard,
} from "lucide-react";
import type { AgenteClientePublico, AgenteClienteBasePublico } from "@/agents/core/types";

interface Props {
  clientes: AgenteClientePublico[];
}

const VAZIO_CLIENTE = {
  nome: "", slug: "", db_host: "", db_porta: 5432,
  db_nome: "", db_usuario: "", db_senha: "", db_schema: "public",
  query_erros: "", analise_painel: false, notas: "", ativo: true,
};

const VAZIO_BASE = {
  nome: "", descricao: "", db_host: "", db_porta: 5432,
  db_nome: "", db_usuario: "", db_senha: "", db_schema: "public", ativo: true,
  papel: "outro" as "emsys" | "outro",
};

const VAZIO_EMSYS = {
  nome: "EMSys3", descricao: "", db_host: "", db_porta: 5432,
  db_nome: "", db_usuario: "", db_senha: "", db_schema: "public",
};

export function ClientesClient({ clientes: inicial }: Props) {
  const router = useRouter();
  const [clientes, setClientes] = useState(inicial);

  // ── Form de cliente
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<AgenteClientePublico | null>(null);
  const [form, setForm] = useState({ ...VAZIO_CLIENTE });
  const [showSenha, setShowSenha] = useState(false);
  const [erroCliente, setErroCliente] = useState<string | null>(null);

  // ── Base EMSys3 obrigatória (cadastro de novo cliente) e resultado da validação do vínculo por CNPJ
  const [emsysForm, setEmsysForm] = useState({ ...VAZIO_EMSYS });
  const [showEmsysSenha, setShowEmsysSenha] = useState(false);
  const [vinculoRes, setVinculoRes] = useState<{ ok: boolean; msg: string; sig: string } | null>(null);
  const [vinculoCarregando, setVinculoCarregando] = useState(false);
  const [vinculoClienteRes, setVinculoClienteRes] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // Assinatura das duas conexões: qualquer alteração invalida a validação feita antes
  const assinaturaAtual = JSON.stringify([
    form.db_host, form.db_porta, form.db_nome, form.db_usuario, form.db_senha, form.db_schema,
    emsysForm.db_host, emsysForm.db_porta, emsysForm.db_nome, emsysForm.db_usuario, emsysForm.db_senha, emsysForm.db_schema,
  ]);
  const vinculoValidoAgora = !!vinculoRes && vinculoRes.ok && vinculoRes.sig === assinaturaAtual;

  // ── Bases adicionais
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

  // ── Helpers cliente
  function abrirNovo() {
    setEditando(null);
    setForm({ ...VAZIO_CLIENTE });
    setEmsysForm({ ...VAZIO_EMSYS });
    setVinculoRes(null);
    setShowEmsysSenha(false);
    setShowSenha(false);
    setErroCliente(null);
    setShowForm(true);
  }

  function abrirEditar(c: AgenteClientePublico) {
    setEditando(c);
    setForm({
      nome: c.nome, slug: c.slug, db_host: c.db_host,
      db_porta: c.db_porta, db_nome: c.db_nome, db_usuario: c.db_usuario,
      db_senha: c.db_senha, db_schema: c.db_schema,
      query_erros: c.query_erros ?? "",
      analise_painel: c.analise_painel ?? false,
      notas: c.notas ?? "", ativo: c.ativo,
    });
    setShowSenha(false);
    setErroCliente(null);
    setShowForm(true);
  }

  function fecharForm() { setShowForm(false); setEditando(null); setErroCliente(null); }

  async function handleSalvar() {
    if (!form.nome || !form.slug || !form.db_host || !form.db_nome || !form.db_usuario) {
      setErroCliente("Preencha todos os campos obrigatorios."); return;
    }
    if (!editando && !form.db_senha) {
      setErroCliente("Informe a senha do banco."); return;
    }
    if (!editando) {
      if (!emsysForm.db_host || !emsysForm.db_nome || !emsysForm.db_usuario || !emsysForm.db_senha) {
        setErroCliente("Preencha os dados da base EMSys3 (obrigatória)."); return;
      }
      if (!vinculoValidoAgora) {
        setErroCliente("Valide o vínculo AS × EMSys3 antes de salvar."); return;
      }
    }
    setLoading("salvar"); setErroCliente(null);
    try {
      const method = editando ? "PUT" : "POST";
      const url = editando ? `/api/agentes/clientes/${editando.id}` : "/api/agentes/clientes";
      const body: any = { ...form };
      if (!editando) body.emsys = { ...emsysForm };
      if (editando && body.db_senha === "••••••••") delete body.db_senha;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErroCliente(data.error); return; }
      if (editando) setClientes(clientes.map((c) => (c.id === editando.id ? data : c)));
      else setClientes([data, ...clientes]);
      fecharForm();
    } catch { setErroCliente("Erro de comunicacao. Tente novamente."); }
    finally { setLoading(null); }
  }

  // Valida (sem salvar) se as bases AS e EMSys3 do formulário são da mesma empresa (CNPJ)
  async function handleValidarVinculoForm() {
    if (!form.db_host || !form.db_nome || !form.db_usuario || !form.db_senha) {
      setVinculoRes({ ok: false, msg: "Preencha a conexão da base AS (host, banco, usuário e senha) antes de validar.", sig: assinaturaAtual }); return;
    }
    if (!emsysForm.db_host || !emsysForm.db_nome || !emsysForm.db_usuario || !emsysForm.db_senha) {
      setVinculoRes({ ok: false, msg: "Preencha a conexão da base EMSys3 (host, banco, usuário e senha) antes de validar.", sig: assinaturaAtual }); return;
    }
    const sig = assinaturaAtual;
    setVinculoCarregando(true);
    setVinculoRes({ ok: false, msg: "Validando CNPJ nas duas bases...", sig });
    try {
      const pick = (f: { db_host: string; db_porta: number; db_nome: string; db_usuario: string; db_senha: string; db_schema: string }) =>
        ({ db_host: f.db_host, db_porta: f.db_porta, db_nome: f.db_nome, db_usuario: f.db_usuario, db_senha: f.db_senha, db_schema: f.db_schema });
      const res = await fetch("/api/agentes/clientes/validar-vinculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as: pick(form), emsys: pick(emsysForm) }),
      });
      const data = await res.json();
      setVinculoRes({ ok: !!data.ok, msg: data.mensagem ?? data.error ?? "Falha ao validar", sig });
    } catch { setVinculoRes({ ok: false, msg: "Erro de rede ao validar o vínculo.", sig }); }
    finally { setVinculoCarregando(false); }
  }

  // Revalida o vínculo de um cliente já cadastrado (usa as credenciais salvas)
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

  // ── Helpers bases
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
      const body: any = { ...baseForm };
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
      if (data.papel === "emsys") handleValidarVinculoCliente(clienteId);
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

  // ── Render helpers
  const fieldCliente = (key: keyof typeof VAZIO_CLIENTE, label: string, opts?: {
    type?: string; placeholder?: string; required?: boolean; hint?: string;
  }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>
        {label}{opts?.required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <input
        type={opts?.type ?? "text"}
        value={String(form[key])}
        onChange={(e) => setForm((p) => ({ ...p, [key]: opts?.type === "number" ? Number(e.target.value) : e.target.value }))}
        placeholder={opts?.placeholder}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box" }}
      />
      {opts?.hint && <p style={{ margin: "3px 0 0", fontSize: 11, opacity: 0.5 }}>{opts.hint}</p>}
    </div>
  );

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
            <p style={{ margin: 0, fontSize: 12, opacity: 0.5 }}>Bases de dados externas para analise de erros</p>
          </div>
        </div>
        <button
          onClick={abrirNovo}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
        >
          <Plus size={14} /> Adicionar Cliente
        </button>
      </div>

      {/* Formulário de cliente */}
      {showForm && (
        <div style={{ padding: 20, borderRadius: 12, border: "1px solid #6366f140", background: "var(--card-bg, white)", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 600 }}>
            {editando ? `Editar: ${editando.nome}` : "Novo Cliente"}
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
            {fieldCliente("nome", "Nome do cliente", { required: true, placeholder: "Ex: Danapetro" })}
            {fieldCliente("slug", "Slug / identificador", { required: true, placeholder: "Ex: danapetro-as", hint: "Letras minusculas, numeros e hifens" })}
          </div>

          <p style={{ margin: "4px 0 12px", fontSize: 12, fontWeight: 600, opacity: 0.5, textTransform: "uppercase" }}>
            Base Principal (fonte dos erros)
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 20px" }}>
            {fieldCliente("db_host", "Host", { required: true, placeholder: "Ex: cloud.digitalrf.com.br" })}
            {fieldCliente("db_porta", "Porta", { type: "number", required: true })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px" }}>
            {fieldCliente("db_nome", "Nome do banco", { required: true, placeholder: "Ex: dunapetrol" })}
            {fieldCliente("db_usuario", "Usuario", { required: true })}
            {fieldCliente("db_schema", "Schema", { placeholder: "public" })}
          </div>

          {/* Senha */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>
              Senha{!editando && <span style={{ color: "#ef4444" }}> *</span>}
              {editando && <span style={{ opacity: 0.5, fontWeight: 400 }}> (deixe em branco para manter)</span>}
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showSenha ? "text" : "password"}
                value={form.db_senha}
                onChange={(e) => setForm((p) => ({ ...p, db_senha: e.target.value }))}
                placeholder={editando ? "••••••••" : "Senha do usuario"}
                style={{ width: "100%", padding: "8px 36px 8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box" }}
              />
              <button type="button" onClick={() => setShowSenha((v) => !v)}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.5 }}>
                {showSenha ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Base EMSys3 obrigatória — só no cadastro; o cliente só é salvo com as duas bases e o CNPJ conferido */}
          {!editando ? (
            <div style={{ margin: "6px 0 16px", padding: "14px 16px", borderRadius: 10, border: "1px solid #6366f140", background: "#f5f6ff" }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, opacity: 0.6, textTransform: "uppercase" }}>
                Base EMSys3 (obrigatória)
              </p>
              <p style={{ margin: "0 0 12px", fontSize: 11, opacity: 0.6, lineHeight: 1.4 }}>
                O cliente só é salvo se o CNPJ da tabela <code>empresa</code> do AS bater com o da <code>tab_empresa</code> do EMSys3.
                Isso garante que as duas bases são do mesmo cliente.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 20px" }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>Host <span style={{ color: "#ef4444" }}>*</span></label>
                  <input value={emsysForm.db_host} onChange={(e) => setEmsysForm((p) => ({ ...p, db_host: e.target.value }))} placeholder="Ex: cloud.digitalrf.com.br"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>Porta <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="number" value={emsysForm.db_porta} onChange={(e) => setEmsysForm((p) => ({ ...p, db_porta: Number(e.target.value) }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px" }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>Nome do banco <span style={{ color: "#ef4444" }}>*</span></label>
                  <input value={emsysForm.db_nome} onChange={(e) => setEmsysForm((p) => ({ ...p, db_nome: e.target.value }))} placeholder="Ex: dunapetrol_emsys"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>Usuario <span style={{ color: "#ef4444" }}>*</span></label>
                  <input value={emsysForm.db_usuario} onChange={(e) => setEmsysForm((p) => ({ ...p, db_usuario: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>Schema</label>
                  <input value={emsysForm.db_schema} onChange={(e) => setEmsysForm((p) => ({ ...p, db_schema: e.target.value }))} placeholder="public"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>Senha <span style={{ color: "#ef4444" }}>*</span></label>
                <div style={{ position: "relative" }}>
                  <input type={showEmsysSenha ? "text" : "password"} value={emsysForm.db_senha}
                    onChange={(e) => setEmsysForm((p) => ({ ...p, db_senha: e.target.value }))} placeholder="Senha do usuario"
                    style={{ width: "100%", padding: "8px 36px 8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 13, boxSizing: "border-box" }} />
                  <button type="button" onClick={() => setShowEmsysSenha((v) => !v)}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.5 }}>
                    {showEmsysSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button type="button" onClick={handleValidarVinculoForm} disabled={vinculoCarregando}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1px solid #6366f1", background: "white", color: "#4f46e5", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {vinculoCarregando ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                Validar vínculo AS × EMSys3
              </button>
              {vinculoRes && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 10, fontSize: 12, lineHeight: 1.4, color: vinculoValidoAgora ? "#15803d" : vinculoRes.msg.startsWith("Validando") ? "#6b7280" : "#b91c1c" }}>
                  {vinculoValidoAgora ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <XCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span>
                    {vinculoRes.sig !== assinaturaAtual && vinculoRes.ok
                      ? "Os dados mudaram depois da validação — valide o vínculo de novo."
                      : vinculoRes.msg}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ margin: "6px 0 16px", padding: "10px 14px", borderRadius: 8, background: "#f9fafb", border: "1px solid var(--border, #e5e7eb)", fontSize: 12, opacity: 0.8 }}>
              A base EMSys3 é editada em "Bases adicionais" (abaixo da lista). Ao alterar a conexão do AS ou do EMSys3, o vínculo por CNPJ é revalidado antes de salvar.
            </div>
          )}

          {/* Análise de painel */}
          <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "#f9fafb" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.analise_painel}
                onChange={(e) => setForm((p) => ({ ...p, analise_painel: e.target.checked }))}
                style={{ accentColor: "#6366f1", width: 15, height: 15, marginTop: 1, flexShrink: 0 }}
              />
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  <LayoutDashboard size={13} style={{ color: "#6366f1" }} />
                  Analisar painel EMSys Gestão automaticamente
                </span>
                <p style={{ margin: "3px 0 0", fontSize: 11, opacity: 0.55, lineHeight: 1.4 }}>
                  Varre a tabela <code>exchange_emsys_gestao_monitoramento_pend</code> da base principal
                  buscando erros com <code>situacao=3</code>. Ative isto se este banco é o AS / Autosistema.
                </p>
              </div>
            </label>
          </div>

          {/* Query customizada — só mostra se análise de painel estiver desativada */}
          {!form.analise_painel && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, opacity: 0.7 }}>
                Query de erros (SQL)
                <span style={{ opacity: 0.5, fontWeight: 400 }}> — executada na varredura automatica</span>
              </label>
              <textarea
                value={form.query_erros}
                onChange={(e) => setForm((p) => ({ ...p, query_erros: e.target.value }))}
                placeholder={"SELECT descricao, contexto, stack\nFROM log_erros\nWHERE resolvido = FALSE\nORDER BY criado_em DESC\nLIMIT 50"}
                rows={5}
                spellCheck={false}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }}
              />
              <p style={{ margin: "3px 0 0", fontSize: 11, opacity: 0.5 }}>
                Retorne as colunas: <code>descricao</code> (obrigatorio), <code>contexto</code> e <code>stack</code> (opcionais).
                Deixe em branco para desativar.
              </p>
            </div>
          )}

          {fieldCliente("notas", "Notas (opcional)", { placeholder: "Observacoes sobre este cliente ou base..." })}

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 18, fontSize: 13 }}>
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
              style={{ accentColor: "#6366f1", width: 15, height: 15 }} />
            Cliente ativo (disponivel para selecionar nas analises)
          </label>

          {erroCliente && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{erroCliente}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSalvar} disabled={loading === "salvar" || (!editando && !vinculoValidoAgora)}
              title={!editando && !vinculoValidoAgora ? "Valide o vínculo AS × EMSys3 para poder salvar" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: (!editando && !vinculoValidoAgora) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: (!editando && !vinculoValidoAgora) ? 0.5 : 1 }}>
              {loading === "salvar" && <Loader2 size={13} className="animate-spin" />}
              {loading === "salvar" ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={fecharForm}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}>
              Cancelar
            </button>
          </div>
        </div>
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
            const listabases = bases[c.id] ?? [];
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
                        {c.db_host}:{c.db_porta} / {c.db_nome}
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
                            ? `Vínculo AS × EMSys3 validado (CNPJ raiz ${c.vinculo_cnpjs ?? "—"}) em ${new Date(c.vinculo_validado_em).toLocaleString("pt-BR")}`
                            : `Vínculo AS × EMSys3 NÃO validado — o agente não opera neste cliente. ${c.vinculo_erro ?? "Clique em Validar vínculo."}`}
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
                      <button onClick={() => handleTestar(c.id)} disabled={loading === "test-" + c.id} title="Testar conexao"
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 12 }}>
                        {loading === "test-" + c.id ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
                        Testar
                      </button>
                      <button onClick={() => handleValidarVinculoCliente(c.id)} disabled={loading === "vinculo-" + c.id} title="Conferir CNPJ entre a base AS e a base EMSys3"
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid #6366f150", background: "transparent", color: "#4f46e5", cursor: "pointer", fontSize: 12 }}>
                        {loading === "vinculo-" + c.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Validar vínculo
                      </button>
                      <button onClick={() => abrirEditar(c)} title="Editar"
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

                {/* Seção de bases adicionais */}
                <div style={{ borderTop: "1px solid var(--border, #e5e7eb)" }}>
                  <button
                    onClick={() => toggleBases(c.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ServerCrash size={12} style={{ color: "#6366f1", opacity: 0.7 }} />
                      <strong style={{ color: "#374151" }}>Bases adicionais para investigação</strong>
                      <span style={{ opacity: 0.5 }}>(ex: emsys3, AS auxiliar)</span>
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
                              Nenhuma base adicional. Adicione a base emsys3 ou outro banco de investigação.
                            </p>
                          )}

                          {/* Lista de bases cadastradas */}
                          {listabases.map((b) => {
                            const testeKey = `${c.id}-${b.id}`;
                            const testeBase = testeBaseRes[testeKey];
                            return (
                              <div key={b.id} style={{ borderRadius: 8, background: "#f9fafb", marginBottom: 6, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px" }}>
                                  <div>
                                    <span style={{ fontSize: 13, fontWeight: 500 }}>{b.nome}</span>
                                    {b.papel === "emsys" && (
                                      <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 8, padding: "1px 7px", borderRadius: 20, background: "#6366f118", color: "#4f46e5" }}>EMSys3 · obrigatória</span>
                                    )}
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
                                    {b.papel !== "emsys" && (
                                      <button onClick={() => handleDeletarBase(c.id, b.id, b.nome)}
                                        disabled={loading === "base-del-" + b.id}
                                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #ef444420", background: "white", cursor: "pointer" }}>
                                        {loading === "base-del-" + b.id
                                          ? <Loader2 size={11} className="animate-spin" style={{ color: "#ef4444" }} />
                                          : <Trash2 size={11} style={{ color: "#ef4444" }} />}
                                      </button>
                                    )}
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

                          {/* Formulário de base */}
                          {baseFormAberto ? (
                            <div style={{ padding: "14px", borderRadius: 10, border: "1px solid #6366f130", background: "#fafafa", marginTop: 8 }}>
                              <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>
                                {editandoBase ? `Editar: ${editandoBase.nome}` : "Nova base de investigação"}
                              </p>
                              {!editandoBase && !listabases.some((x) => x.papel === "emsys") && (
                                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 10, cursor: "pointer" }}>
                                  <input type="checkbox" checked={baseForm.papel === "emsys"}
                                    onChange={(e) => setBaseForm((p) => ({ ...p, papel: e.target.checked ? "emsys" : "outro" }))}
                                    style={{ accentColor: "#6366f1" }} />
                                  Esta é a base <strong>EMSys3</strong> do cliente (o CNPJ será conferido com o AS antes de salvar)
                                </label>
                              )}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
                                {fieldBase("nome", "Nome da base", { required: true, placeholder: "Ex: emsys3" })}
                                {fieldBase("descricao", "Descrição", { placeholder: "Ex: Banco EMSys 3" })}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 14px" }}>
                                {fieldBase("db_host", "Host", { required: true, placeholder: "Ex: cloud.digitalrf.com.br" })}
                                {fieldBase("db_porta", "Porta", { type: "number", required: true })}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px" }}>
                                {fieldBase("db_nome", "Banco", { required: true, placeholder: "Ex: emsys3" })}
                                {fieldBase("db_usuario", "Usuário", { required: true })}
                                {fieldBase("db_schema", "Schema" )}
                              </div>
                              {/* Senha da base */}
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
