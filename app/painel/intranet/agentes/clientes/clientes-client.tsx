"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Pencil, Trash2, Wifi,
  CheckCircle2, XCircle, Loader2, Database, Clock, Code2, LayoutDashboard,
} from "lucide-react";
import type { AgenteClientePublico } from "@/agents/core/types";
import { ClienteForm } from "./cliente-form";

interface Props {
  clientes: AgenteClientePublico[];
}

export function ClientesClient({ clientes: inicial }: Props) {
  const router = useRouter();
  const [clientes, setClientes] = useState(inicial);

  // ── Form de cliente (AS + EMSys3 juntos)
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<AgenteClientePublico | null>(null);
  const [formKey, setFormKey] = useState(0);

  // ── Loading / Teste
  const [loading, setLoading] = useState<string | null>(null);
  const [testeRes, setTesteRes] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [vinculoClienteRes, setVinculoClienteRes] = useState<Record<string, { ok: boolean; msg: string }>>({});

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
            return (
              <div key={c.id} style={{ borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", overflow: "hidden" }}>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
