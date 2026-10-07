"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Loader2,
  Globe,
  ChevronRight,
  X,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { SaasInstancia, SaasStatus } from "@/types";

type Modo = "criar" | "editar";

const STATUS_LABEL: Record<SaasStatus, string> = {
  ativo: "Ativo",
  trial: "Trial",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};

const STATUS_COR: Record<SaasStatus, string> = {
  ativo: "bg-green-50 text-green-700 border-green-200",
  trial: "bg-blue-50 text-blue-700 border-blue-200",
  suspenso: "bg-amber-50 text-amber-700 border-amber-200",
  cancelado: "bg-gray-100 text-gray-500 border-gray-200",
};

const formVazio = {
  slug: "",
  database_name: "",
  nome_cliente: "",
  dominio: "",
  plano: "basico",
  obs: "",
  status: "ativo" as SaasStatus,
};

export function SaasClient() {
  const [instancias, setInstancias] = useState<SaasInstancia[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(false);

  const [painelAberto, setPainelAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("criar");
  const [selecionado, setSelecionado] = useState<SaasInstancia | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [gerandoToken, setGerandoToken] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio);
  const [mostrarToken, setMostrarToken] = useState(false);
  const [tokenCopiado, setTokenCopiado] = useState(false);

  const carregar = useCallback(async () => {
    if (!mountedRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const params = new URLSearchParams({ q: busca });
      const res = await fetch(`/api/saas/instancias?${params}`);
      const data = await res.json();
      setInstancias(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
      setRefreshing(false);
      mountedRef.current = true;
    }
  }, [busca]);

  useEffect(() => {
    const delay = mountedRef.current ? 300 : 0;
    const t = setTimeout(carregar, delay);
    return () => clearTimeout(t);
  }, [carregar]);

  function abrirNovo() {
    setModo("criar");
    setSelecionado(null);
    setForm(formVazio);
    setErro("");
    setMostrarToken(false);
    setPainelAberto(true);
  }

  function abrirInstancia(i: SaasInstancia) {
    setModo("editar");
    setSelecionado(i);
    setForm({
      slug: i.slug,
      database_name: i.database_name,
      nome_cliente: i.nome_cliente,
      dominio: i.dominio ?? "",
      plano: i.plano,
      obs: i.obs ?? "",
      status: i.status,
    });
    setErro("");
    setMostrarToken(false);
    setTokenCopiado(false);
    setPainelAberto(true);
  }

  async function salvar() {
    if (!form.nome_cliente || (modo === "criar" && (!form.slug || !form.database_name))) {
      setErro("Nome, slug e database são obrigatórios");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const url = modo === "criar" ? "/api/saas/instancias" : `/api/saas/instancias/${selecionado?.id}`;
      const method = modo === "criar" ? "POST" : "PATCH";
      const body =
        modo === "criar"
          ? {
              slug: form.slug,
              database_name: form.database_name,
              nome_cliente: form.nome_cliente,
              dominio: form.dominio || null,
              plano: form.plano,
              obs: form.obs || null,
            }
          : {
              nome_cliente: form.nome_cliente,
              dominio: form.dominio || null,
              plano: form.plano,
              obs: form.obs || null,
              status: form.status,
            };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao salvar");
        return;
      }
      if (modo === "criar") {
        toast.success("Instância cadastrada com sucesso!");
        setPainelAberto(false);
        setSelecionado(null);
        setForm(formVazio);
      } else {
        toast.success("Instância atualizada com sucesso!");
        setSelecionado(data);
      }
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function gerarToken() {
    if (!selecionado) return;
    setGerandoToken(true);
    try {
      const res = await fetch(`/api/saas/instancias/${selecionado.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gerar_token: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao gerar token");
        return;
      }
      setSelecionado(data);
      setMostrarToken(true);
      toast.success("Token gerado");
      carregar();
    } finally {
      setGerandoToken(false);
    }
  }

  function copiarToken() {
    if (!selecionado?.token_api) return;
    navigator.clipboard.writeText(selecionado.token_api).then(() => {
      setTokenCopiado(true);
      setTimeout(() => setTokenCopiado(false), 1500);
    });
  }

  async function excluir() {
    if (!selecionado) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/saas/instancias/${selecionado.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao excluir");
        setConfirmarExclusao(false);
        return;
      }
      toast.success("Instância excluída com sucesso!");
      setConfirmarExclusao(false);
      setPainelAberto(false);
      setSelecionado(null);
      carregar();
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="flex gap-0 h-full -mx-6 -mb-6">
      {/* ── Coluna esquerda: lista ── */}
      <div
        className={`flex flex-col bg-white border-r border-gray-200 transition-[width,flex] duration-200 ${
          painelAberto ? "w-72 min-w-[288px]" : "flex-1"
        }`}
      >
        <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100">
          <button
            onClick={abrirNovo}
            className="w-full flex items-center justify-between rounded-lg group transition-colors"
            style={{
              backgroundColor: "var(--color-brand)",
              color: "#FFFFFF",
              padding: "8px 14px",
              marginBottom: 12,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-brand-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-brand)";
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.2)" }}
              >
                <Plus size={13} strokeWidth={2} />
              </div>
              <div className="text-left">
                <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>Nova instância</p>
                {!painelAberto && (
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", lineHeight: 1.2 }}>
                    Liberar cliente novo
                  </p>
                )}
              </div>
            </div>
            <ChevronRight
              size={14}
              style={{ color: "rgba(255,255,255,0.6)" }}
              className="group-hover:translate-x-0.5 transition-transform flex-shrink-0"
            />
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              placeholder="Buscar por nome, slug ou database..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
            {refreshing && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-gray-300" />
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">{total} instância(s)</p>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50">
                <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-gray-100 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))
          ) : instancias.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Globe size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhuma instância</p>
            </div>
          ) : (
            <div className={refreshing ? "opacity-60 transition-opacity duration-150" : ""}>
              {instancias.map((i) => (
                <button
                  key={i.id}
                  onClick={() => abrirInstancia(i)}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left border-b border-gray-50 transition-colors group ${
                    selecionado?.id === i.id && painelAberto
                      ? "bg-blue-50 border-r-2 border-r-blue-500"
                      : "hover:bg-gray-50"
                  } ${i.status === "cancelado" ? "opacity-50" : ""}`}
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-600">
                      {i.nome_cliente.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate ${
                        selecionado?.id === i.id && painelAberto ? "text-blue-700" : "text-gray-900"
                      }`}
                    >
                      {i.nome_cliente}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{i.slug} · {i.database_name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COR[i.status]}`}>
                      {STATUS_LABEL[i.status]}
                    </Badge>
                    <ChevronRight size={12} className="text-gray-300" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Painel direito: formulário ── */}
      <div
        className={`flex flex-col bg-gray-50 border-l border-gray-200 transition-[width,flex] duration-200 overflow-hidden ${
          painelAberto ? "flex-1" : "w-0"
        }`}
      >
        {painelAberto && (
          <>
            {/* Cabeçalho */}
            <div className="flex items-start justify-between px-6 py-5 bg-white border-b border-gray-100">
              <div>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-0.5">
                  {modo === "criar" ? "NOVA INSTÂNCIA" : "EDITANDO INSTÂNCIA"}
                </p>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">
                  {modo === "criar" ? "Novo cadastro" : form.nome_cliente || "—"}
                </h2>
              </div>
              <button
                onClick={() => {
                  setPainelAberto(false);
                  setSelecionado(null);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 mt-0.5"
              >
                <X size={16} />
              </button>
            </div>

            {/* Campos */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Nome do cliente <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.nome_cliente}
                  onChange={(e) => setForm((f) => ({ ...f, nome_cliente: e.target.value }))}
                  placeholder="Ex: Instituto Cardiosport"
                  className="h-9 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Slug <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                    placeholder="hiitcor"
                    disabled={modo === "editar"}
                    className="h-9 bg-white font-mono text-xs disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Database <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.database_name}
                    onChange={(e) => setForm((f) => ({ ...f, database_name: e.target.value.toLowerCase() }))}
                    placeholder="hiitcor"
                    disabled={modo === "editar"}
                    className="h-9 bg-white font-mono text-xs disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Domínio
                  </Label>
                  <Input
                    value={form.dominio}
                    onChange={(e) => setForm((f) => ({ ...f, dominio: e.target.value }))}
                    placeholder="cliente.digitalrf.com.br"
                    className="h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Plano
                  </Label>
                  <Input
                    value={form.plano}
                    onChange={(e) => setForm((f) => ({ ...f, plano: e.target.value }))}
                    placeholder="basico"
                    className="h-9 bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Observações
                </Label>
                <Textarea
                  value={form.obs}
                  onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))}
                  rows={3}
                  placeholder="Anotações internas sobre o cliente..."
                  className="resize-none text-sm bg-white"
                />
              </div>

              {/* Status — só faz sentido depois de criado */}
              {modo === "editar" && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Liberação
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(STATUS_LABEL) as SaasStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, status: s }))}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                          form.status === s ? STATUS_COR[s] : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Token de API — só depois de criado */}
              {modo === "editar" && selecionado && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Token de API
                  </Label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Input
                        value={selecionado.token_api ?? ""}
                        readOnly
                        type={mostrarToken ? "text" : "password"}
                        placeholder="nenhum token gerado"
                        className="h-9 bg-white font-mono text-xs pr-16"
                      />
                      {selecionado.token_api && (
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5">
                          <button
                            type="button"
                            onClick={() => setMostrarToken((v) => !v)}
                            className="p-1.5 text-gray-400 hover:text-gray-600"
                            title={mostrarToken ? "Ocultar" : "Mostrar"}
                          >
                            {mostrarToken ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={copiarToken}
                            className="p-1.5 text-gray-400 hover:text-gray-600"
                            title="Copiar"
                          >
                            {tokenCopiado ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                          </button>
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={gerarToken}
                      disabled={gerandoToken}
                      className="h-9 text-xs whitespace-nowrap"
                    >
                      {gerandoToken && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      {selecionado.token_api ? "Regenerar" : "Gerar token"}
                    </Button>
                  </div>
                </div>
              )}

              {erro && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
              )}
            </div>

            {/* Confirmação de exclusão */}
            {confirmarExclusao && (
              <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700 mb-1">Confirmar exclusão</p>
                <p className="text-xs text-red-500 mb-3">
                  Esta ação é irreversível e remove o token de API dessa instância.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmarExclusao(false)} className="h-8 text-xs">
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={excluir}
                    disabled={excluindo}
                    className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                  >
                    {excluindo && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Excluir definitivamente
                  </Button>
                </div>
              </div>
            )}

            {/* Rodapé */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-gray-100">
              {modo === "editar" ? (
                <Button
                  variant="outline"
                  onClick={() => setConfirmarExclusao(true)}
                  className="h-9 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Excluir
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPainelAberto(false);
                    setSelecionado(null);
                  }}
                  className="h-9"
                >
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={salvando} className="h-9 min-w-[90px]">
                  {salvando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
