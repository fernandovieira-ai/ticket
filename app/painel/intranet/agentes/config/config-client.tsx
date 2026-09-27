"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, Bot } from "lucide-react";
import type { AgenteConfig, TipoCorrecao } from "@/agents/core/types";

interface Props {
  config: AgenteConfig | null;
}

const TIPOS: { value: TipoCorrecao; label: string; descricao: string }[] = [
  { value: "configuracao",   label: "Configuração",    descricao: "Ajustes de parâmetros e configurações do sistema" },
  { value: "codigo",         label: "Código",          descricao: "Correções em regras de negócio e fluxos" },
  { value: "infraestrutura", label: "Infraestrutura",  descricao: "Ajustes de acessos, permissões e infraestrutura" },
  { value: "dados",          label: "Dados",           descricao: "Correções em dados e consultas ao banco de dados" },
  { value: "outro",          label: "Outro",           descricao: "Outros tipos de correção não categorizados" },
];

export function AgenteConfigClient({ config }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    ativo: config?.ativo ?? false,
    auto_aprovar_tipos: config?.auto_aprovar_tipos ?? [] as TipoCorrecao[],
    notificar_email: config?.notificar_email ?? false,
    notificar_whatsapp: config?.notificar_whatsapp ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function toggleTipo(tipo: TipoCorrecao) {
    setForm((prev) => ({
      ...prev,
      auto_aprovar_tipos: prev.auto_aprovar_tipos.includes(tipo)
        ? prev.auto_aprovar_tipos.filter((t) => t !== tipo)
        : [...prev.auto_aprovar_tipos, tipo],
    }));
  }

  async function handleSalvar() {
    setLoading(true);
    setErro(null);
    setSucesso(false);
    try {
      const res = await fetch("/api/agentes/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error); return; }
      setSucesso(true);
      setTimeout(() => setSucesso(false), 3000);
    } catch {
      setErro("Erro ao salvar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 700 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button
          onClick={() => router.back()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13 }}
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bot size={20} style={{ opacity: 0.6 }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Configuração do Agente</h1>
        </div>
      </div>

      {/* Bloco: Ativar agente */}
      <section style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Agente Ativo</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.6 }}>
              Habilita análise automática de erros com IA
            </p>
          </div>
          <button
            onClick={() => setForm((p) => ({ ...p, ativo: !p.ativo }))}
            style={{
              width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
              background: form.ativo ? "#6366f1" : "#e5e7eb",
              position: "relative", transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: 3,
              left: form.ativo ? 26 : 3,
              width: 20, height: 20, borderRadius: 10,
              background: "white", transition: "left 0.2s",
              boxShadow: "0 1px 3px #0003",
            }} />
          </button>
        </div>
      </section>

      {/* Bloco: Auto-aprovação */}
      <section style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", marginBottom: 16 }}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Aprovação Automática</p>
        <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.6 }}>
          Tipos de correção que serão aprovados automaticamente (risco crítico nunca é auto-aprovado)
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TIPOS.map((tipo) => (
            <label key={tipo.value} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "10px 14px", borderRadius: 8, border: `1px solid ${form.auto_aprovar_tipos.includes(tipo.value) ? "#6366f140" : "var(--border, #e5e7eb)"}`, background: form.auto_aprovar_tipos.includes(tipo.value) ? "#6366f108" : "transparent", transition: "all 0.15s" }}>
              <input
                type="checkbox"
                checked={form.auto_aprovar_tipos.includes(tipo.value)}
                onChange={() => toggleTipo(tipo.value)}
                style={{ marginTop: 2, accentColor: "#6366f1", width: 16, height: 16 }}
              />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{tipo.label}</p>
                <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>{tipo.descricao}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Bloco: Notificações */}
      <section style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", marginBottom: 24 }}>
        <p style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Notificações</p>
        {[
          { key: "notificar_email" as const,     label: "E-mail",    desc: "Receber e-mail quando nova proposta for gerada" },
          { key: "notificar_whatsapp" as const,  label: "WhatsApp",  desc: "Receber mensagem no WhatsApp ao gerar proposta" },
        ].map((n) => (
          <div key={n.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{n.label}</p>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>{n.desc}</p>
            </div>
            <button
              onClick={() => setForm((p) => ({ ...p, [n.key]: !p[n.key] }))}
              style={{ width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", background: form[n.key] ? "#6366f1" : "#e5e7eb", position: "relative", transition: "background 0.2s" }}
            >
              <span style={{ position: "absolute", top: 3, left: form[n.key] ? 26 : 3, width: 20, height: 20, borderRadius: 10, background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px #0003" }} />
            </button>
          </div>
        ))}
      </section>

      {/* Botão salvar */}
      {erro && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{erro}</p>}
      {sucesso && <p style={{ color: "#22c55e", fontSize: 13, marginBottom: 10 }}>Configurações salvas com sucesso!</p>}
      <button
        onClick={handleSalvar}
        disabled={loading}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 8, border: "none", background: "#6366f1", color: "white", cursor: "pointer", fontSize: 14, fontWeight: 500, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {loading ? "Salvando..." : "Salvar Configurações"}
      </button>
    </div>
  );
}
