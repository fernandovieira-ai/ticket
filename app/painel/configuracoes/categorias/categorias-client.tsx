"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Loader2,
  Tag,
  ChevronRight,
  X,
  Trash2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import type { Categoria, Departamento } from "@/types";

type DepVinculo = { departamento_id: string; nome: string; descricao: string | null };

type Modo = "criar" | "editar";
type Aba = "dados" | "departamentos";

const formVazio = {
  nome: "",
  descricao: "",
  parent_id: "",
  sla_primeira_resp: "",
  sla_resolucao: "",
  visivel_cliente: true,
  ativo: true,
  ordem: 0,
};

export function CategoriasClient() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(false);

  const [painelAberto, setPainelAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("criar");
  const [aba, setAba] = useState<Aba>("dados");
  const [selecionado, setSelecionado] = useState<Categoria | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio);

  // Departamentos vinculados
  const [depVinculos, setDepVinculos] = useState<DepVinculo[]>([]);
  const [depSelecionado, setDepSelecionado] = useState("");
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [salvandoDep, setSalvandoDep] = useState(false);

  const carregar = useCallback(async () => {
    if (!mountedRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const params = new URLSearchParams({ q: busca, pageSize: "100" });
      const res = await fetch(`/api/categorias?${params}`);
      const data = await res.json();
      setCategorias(data.data ?? []);
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

  useEffect(() => {
    fetch("/api/departamentos?pageSize=200")
      .then((r) => r.json())
      .then((d) => setDepartamentos(d.data ?? []));
  }, []);

  const carregarDepVinculos = useCallback(async (catId: string) => {
    setLoadingDeps(true);
    try {
      const res = await fetch(`/api/categorias/${catId}/departamentos`);
      const data = await res.json();
      setDepVinculos(Array.isArray(data) ? data : []);
    } finally {
      setLoadingDeps(false);
    }
  }, []);

  async function vincularDepartamento() {
    if (!depSelecionado || !selecionado) return;
    setSalvandoDep(true);
    try {
      const res = await fetch(`/api/categorias/${selecionado.id}/departamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departamento_id: depSelecionado }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao vincular");
        return;
      }
      toast.success("Departamento vinculado!");
      setDepSelecionado("");
      carregarDepVinculos(selecionado.id);
    } finally {
      setSalvandoDep(false);
    }
  }

  async function desvincularDepartamento(departamento_id: string) {
    if (!selecionado) return;
    const res = await fetch(`/api/categorias/${selecionado.id}/departamentos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departamento_id }),
    });
    if (!res.ok) {
      toast.error("Erro ao remover vínculo");
      return;
    }
    toast.success("Departamento removido!");
    setDepVinculos((prev) => prev.filter((d) => d.departamento_id !== departamento_id));
  }

  function abrirNovo() {
    setModo("criar");
    setSelecionado(null);
    setForm(formVazio);
    setErro("");
    setAba("dados");
    setDepVinculos([]);
    setPainelAberto(true);
  }

  function abrirCategoria(c: Categoria) {
    setModo("editar");
    setSelecionado(c);
    setAba("dados");
    setDepVinculos([]);
    setForm({
      nome: c.nome,
      descricao: c.descricao ?? "",
      parent_id: c.parent_id ?? "",
      sla_primeira_resp: c.sla_primeira_resp ?? "",
      sla_resolucao: c.sla_resolucao ?? "",
      visivel_cliente: c.visivel_cliente,
      ativo: c.ativo,
      ordem: c.ordem,
    });
    setErro("");
    setPainelAberto(true);
  }

  async function salvar() {
    if (!form.nome) {
      setErro("Nome é obrigatório");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const url =
        modo === "criar"
          ? "/api/categorias"
          : `/api/categorias/${selecionado?.id}`;
      const method = modo === "criar" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          descricao: form.descricao || null,
          parent_id: form.parent_id || null,
          sla_primeira_resp: form.sla_primeira_resp || null,
          sla_resolucao: form.sla_resolucao || null,
          visivel_cliente: form.visivel_cliente,
          ativo: form.ativo,
          ordem: form.ordem,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao salvar");
        return;
      }
      if (modo === "criar") {
        toast.success("Categoria cadastrada com sucesso!");
        setPainelAberto(false);
        setSelecionado(null);
        setForm(formVazio);
      } else {
        toast.success("Categoria atualizada com sucesso!");
        setSelecionado(data);
      }
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!selecionado) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/categorias/${selecionado.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao excluir");
        setConfirmarExclusao(false);
        return;
      }
      toast.success("Categoria excluída com sucesso!");
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
              (e.currentTarget as HTMLElement).style.backgroundColor =
                "var(--color-brand-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                "var(--color-brand)";
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0.2)",
                }}
              >
                <Plus size={13} strokeWidth={2} />
              </div>
              <div className="text-left">
                <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
                  Nova categoria
                </p>
                {!painelAberto && (
                  <p
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.7)",
                      lineHeight: 1.2,
                    }}
                  >
                    Cadastrar no sistema
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
              placeholder="Buscar por nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
            {refreshing && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-gray-300" />
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">{total} categoria(s)</p>
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
          ) : categorias.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Tag size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhuma categoria</p>
            </div>
          ) : (
            <div className={refreshing ? "opacity-60 transition-opacity duration-150" : ""}>
            {categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => abrirCategoria(c)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left border-b border-gray-50 transition-colors group ${
                  selecionado?.id === c.id && painelAberto
                    ? "bg-blue-50 border-r-2 border-r-blue-500"
                    : "hover:bg-gray-50"
                } ${!c.ativo ? "opacity-50" : ""}`}
              >
                <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-violet-600">
                    {c.nome.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium truncate ${
                      selecionado?.id === c.id && painelAberto
                        ? "text-blue-700"
                        : "text-gray-900"
                    }`}
                  >
                    {c.nome}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {c.departamentos_nomes && c.departamentos_nomes.length > 0
                      ? `Depto: ${c.departamentos_nomes.join(", ")}`
                      : (c.descricao ?? "Sem descrição")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge
                    variant={c.ativo ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {c.ativo ? "Ativa" : "Inativa"}
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
            <div className="flex-shrink-0 bg-white border-b border-gray-100">
              <div className="flex items-start justify-between px-6 pt-5 pb-3">
                <div>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-0.5">
                    {modo === "criar" ? "NOVA CATEGORIA" : "EDITANDO CATEGORIA"}
                  </p>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">
                    {modo === "criar" ? "Novo cadastro" : form.nome || "—"}
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
              {/* Abas — só exibe em edição */}
              {modo === "editar" && (
                <div className="flex gap-0 px-6">
                  <button
                    onClick={() => setAba("dados")}
                    className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                      aba === "dados"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    Dados
                  </button>
                  <button
                    onClick={() => { setAba("departamentos"); if (selecionado && depVinculos.length === 0 && !loadingDeps) carregarDepVinculos(selecionado.id); }}
                    className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                      aba === "departamentos"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <Building2 size={12} />
                    Departamentos
                    {depVinculos.length > 0 && (
                      <span className="ml-0.5 bg-blue-100 text-blue-600 rounded-full px-1.5 py-0 text-[10px] font-bold">
                        {depVinculos.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Aba: Departamentos */}
            {aba === "departamentos" && (
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {/* Adicionar departamento */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Vincular departamento
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={depSelecionado || "__none__"}
                      onValueChange={(v) =>
                        setDepSelecionado(!v || v === "__none__" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-9 bg-white flex-1">
                        <SelectValue>
                          {depSelecionado
                            ? (departamentos.find((d) => d.id === depSelecionado)?.nome ?? "Selecione...")
                            : "Selecione um departamento..."}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Selecione...</SelectItem>
                        {departamentos
                          .filter(
                            (d) =>
                              d.ativo &&
                              !depVinculos.some((v) => v.departamento_id === d.id)
                          )
                          .map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={vincularDepartamento}
                      disabled={!depSelecionado || salvandoDep}
                      className="h-9 px-3"
                    >
                      {salvandoDep ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Plus size={14} />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Lista de vínculos */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Departamentos vinculados
                  </Label>
                  {loadingDeps ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                  ) : depVinculos.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center">
                      <Building2 size={24} className="mx-auto mb-2 text-gray-300" />
                      <p className="text-xs text-gray-400">Nenhum departamento vinculado</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {depVinculos.map((dep) => (
                        <div
                          key={dep.departamento_id}
                          className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <Building2 size={12} className="text-indigo-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{dep.nome}</p>
                              {dep.descricao && (
                                <p className="text-xs text-gray-400 truncate max-w-[180px]">
                                  {dep.descricao}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => desvincularDepartamento(dep.departamento_id)}
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                            title="Remover vínculo"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Aba: Dados */}
            {(aba === "dados" || modo === "criar") && (
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Nome <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.nome}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nome: e.target.value }))
                  }
                  placeholder="Ex: Suporte Técnico"
                  className="h-9 bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Descrição
                </Label>
                <Textarea
                  value={form.descricao}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, descricao: e.target.value }))
                  }
                  rows={3}
                  placeholder="Descreva quando usar esta categoria..."
                  className="resize-none text-sm bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    SLA 1ª resposta
                  </Label>
                  <Input
                    value={form.sla_primeira_resp}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        sla_primeira_resp: e.target.value,
                      }))
                    }
                    placeholder="ex: 2 hours"
                    className="h-9 bg-white text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    SLA resolução
                  </Label>
                  <Input
                    value={form.sla_resolucao}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sla_resolucao: e.target.value }))
                    }
                    placeholder="ex: 1 day"
                    className="h-9 bg-white text-sm"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 -mt-3">
                Formatos aceitos:{" "}
                <code className="bg-gray-100 px-1 rounded">2 hours</code>,{" "}
                <code className="bg-gray-100 px-1 rounded">1 day</code>,{" "}
                <code className="bg-gray-100 px-1 rounded">30 minutes</code>,{" "}
                <code className="bg-gray-100 px-1 rounded">1 day 4 hours</code>
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Ordem
                  </Label>
                  <Input
                    type="number"
                    value={form.ordem}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        ordem: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="h-9 bg-white text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </Label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, ativo: !f.ativo }))}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      form.ativo
                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${form.ativo ? "bg-green-500" : "bg-gray-400"}`}
                    />
                    {form.ativo ? "Ativa" : "Inativa"}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Visível para cliente
                </Label>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      visivel_cliente: !f.visivel_cliente,
                    }))
                  }
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    form.visivel_cliente
                      ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${form.visivel_cliente ? "bg-blue-500" : "bg-gray-400"}`}
                  />
                  {form.visivel_cliente ? "Sim" : "Não"}
                </button>
              </div>

              {erro && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {erro}
                </p>
              )}
            </div>
            )}

            {/* Confirmação de exclusão */}
            {confirmarExclusao && (
              <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700 mb-1">
                  Confirmar exclusão
                </p>
                <p className="text-xs text-red-500 mb-3">
                  Esta ação é irreversível. Não é possível excluir categorias
                  com subcategorias.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmarExclusao(false)}
                    className="h-8 text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={excluir}
                    disabled={excluindo}
                    className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                  >
                    {excluindo && (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    )}
                    Excluir definitivamente
                  </Button>
                </div>
              </div>
            )}

            {/* Rodapé — oculto na aba departamentos */}
            {aba !== "departamentos" && <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-gray-100">
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
                <Button
                  onClick={salvar}
                  disabled={salvando}
                  className="h-9 min-w-[90px]"
                >
                  {salvando && (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  )}
                  Salvar
                </Button>
              </div>
            </div>}
          </>
        )}
      </div>
    </div>
  );
}
