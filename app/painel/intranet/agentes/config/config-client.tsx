"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, Bot, Trash2 } from "lucide-react";
import { normalizarTiposCorrecao, type AgenteConfig, type AgenteAutonomia } from "@/agents/core/types";

interface Props {
  config: AgenteConfig | null;
  autoAplicar: AgenteAutonomia[];
}

export function AgenteConfigClient({ config, autoAplicar: autoAplicarInicial }: Props) {
  const router = useRouter();
  const [autoAplicar, setAutoAplicar] = useState(autoAplicarInicial);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [form, setForm] = useState({
    ativo: config?.ativo ?? false,
    auto_aprovar_tipos: normalizarTiposCorrecao(config?.auto_aprovar_tipos),
    notificar_email: config?.notificar_email ?? false,
    notificar_whatsapp: config?.notificar_whatsapp ?? false,
    autonomia_ativa: config?.autonomia_ativa ?? false,
    autonomia_min_sucessos: config?.autonomia_min_sucessos ?? 2,
    autonomia_limite_diario: config?.autonomia_limite_diario ?? 10,
  });
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function desativarAuto(item: AgenteAutonomia) {
    setRemovendo(item.assinatura_hash);
    setErro(null);
    try {
      const res = await fetch("/api/agentes/auto-aplicar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assinatura_hash: item.assinatura_hash, assinatura: item.assinatura }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error); return; }
      setAutoAplicar((prev) => prev.filter((x) => x.assinatura_hash !== item.assinatura_hash));
    } catch {
      setErro("Erro ao desativar. Tente novamente.");
    } finally {
      setRemovendo(null);
    }
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

      {/* Bloco: Execução automática por tipo de erro */}
      <section style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", marginBottom: 16 }}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Execução Automática por Tipo de Erro</p>
        <p style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.6 }}>
          Toda proposta fica <strong>Aguardando</strong> o operador. Para o agente executar sozinho um tipo de erro,
          marque a opção ao usar &quot;Aprovar e Aplicar&quot; numa proposta; os tipos marcados aparecem aqui.
        </p>
        {autoAplicar.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>Nenhum tipo de erro marcado para execução automática.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {autoAplicar.map((item) => (
              <div key={item.assinatura_hash} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid #6366f140", background: "#6366f108" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, wordBreak: "break-word" }}>{item.assinatura}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.55 }}>
                    {item.auto_aplicar_em && `Marcado em ${new Date(item.auto_aplicar_em).toLocaleString("pt-BR")} · `}
                    {item.falhas_consecutivas > 0
                      ? `${item.falhas_consecutivas} falha(s) recente(s): aguarda o operador até uma correção ser confirmada`
                      : `${item.total_sucessos} sucesso(s) confirmado(s)`}
                  </p>
                </div>
                <button
                  onClick={() => desativarAuto(item)}
                  disabled={removendo === item.assinatura_hash}
                  title="Volta a exigir aprovação do operador"
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}
                >
                  {removendo === item.assinatura_hash ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Desativar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bloco: Autonomia */}
      <section style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, white)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Autonomia do Agente</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.6 }}>
              O agente aplica o SQL sozinho, só para tipos de erro que ele já corrigiu com sucesso confirmado
            </p>
          </div>
          <button
            onClick={() => setForm((p) => ({ ...p, autonomia_ativa: !p.autonomia_ativa }))}
            style={{ width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", background: form.autonomia_ativa ? "#6366f1" : "#e5e7eb", position: "relative", transition: "background 0.2s" }}
          >
            <span style={{ position: "absolute", top: 3, left: form.autonomia_ativa ? 26 : 3, width: 20, height: 20, borderRadius: 10, background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px #0003" }} />
          </button>
        </div>
        <ul style={{ margin: "14px 0 0", paddingLeft: 18, fontSize: 12, opacity: 0.65, lineHeight: 1.6 }}>
          <li>"Sucesso confirmado" = o SQL foi aplicado e, depois, o erro sumiu do painel do cliente.</li>
          <li>Recaída do erro ou correção rejeitada por um operador zera a confiança daquele tipo de erro.</li>
          <li>Só INSERT/UPDATE de risco baixo ou médio; nunca DELETE, DDL ou risco alto/crítico.</li>
        </ul>
        {form.autonomia_ativa && (
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              Sucessos confirmados exigidos
              <input
                type="number" min={1} max={20}
                value={form.autonomia_min_sucessos}
                onChange={(e) => setForm((p) => ({ ...p, autonomia_min_sucessos: Math.min(20, Math.max(1, Number(e.target.value) || 1)) }))}
                style={{ width: 110, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)", fontSize: 13 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              Limite de aplicações por dia
              <input
                type="number" min={1} max={100}
                value={form.autonomia_limite_diario}
                onChange={(e) => setForm((p) => ({ ...p, autonomia_limite_diario: Math.min(100, Math.max(1, Number(e.target.value) || 1)) }))}
                style={{ width: 110, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)", fontSize: 13 }}
              />
            </label>
          </div>
        )}
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
