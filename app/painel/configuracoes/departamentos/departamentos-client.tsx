"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Loader2,
  Building2,
  ChevronRight,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Departamento } from "@/types";

type Modo = "criar" | "editar";

const formVazio = {
  nome: "",
  descricao: "",
  ativo: true,
};

export function DepartamentosClient() {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  const [painelAberto, setPainelAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("criar");
  const [selecionado, setSelecionado] = useState<Departamento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: busca, pageSize: "50" });
      const res = await fetch(`/api/departamentos?${params}`);
      const data = await res.json();
      setDepartamentos(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, 300);
    return () => clearTimeout(t);
  }, [carregar]);

  function abrirNovo() {
    setModo("criar");
    setSelecionado(null);
    setForm(formVazio);
    setErro("");
    setPainelAberto(true);
  }

  function abrirDepartamento(d: Departamento) {
    setModo("editar");
    setSelecionado(d);
    setForm({
      nome: d.nome,
      descricao: d.descricao ?? "",
      ativo: d.ativo ?? true,
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
          ? "/api/departamentos"
          : `/api/departamentos/${selecionado?.id}`;
      const method = modo === "criar" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          descricao: form.descricao || null,
          ativo: form.ativo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao salvar");
        return;
      }
      if (modo === "criar") {
        toast.success("Departamento cadastrado com sucesso!");
        setPainelAberto(false);
        setSelecionado(null);
        setForm(formVazio);
      } else {
        toast.success("Departamento atualizado com sucesso!");
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
      const res = await fetch(`/api/departamentos/${selecionado.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao excluir");
        setConfirmarExclusao(false);
        return;
      }
      toast.success("Departamento excluído com sucesso!");
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
        className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ${
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
                  Novo departamento
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
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            {total} departamento(s)
          </p>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : departamentos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum departamento</p>
            </div>
          ) : (
            departamentos.map((d) => (
              <button
                key={d.id}
                onClick={() => abrirDepartamento(d)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left border-b border-gray-50 transition-colors group ${
                  selecionado?.id === d.id && painelAberto
                    ? "bg-blue-50 border-r-2 border-r-blue-500"
                    : "hover:bg-gray-50"
                } ${!d.ativo ? "opacity-50" : ""}`}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-indigo-600">
                    {d.nome.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium truncate ${
                      selecionado?.id === d.id && painelAberto
                        ? "text-blue-700"
                        : "text-gray-900"
                    }`}
                  >
                    {d.nome}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {d.descricao ?? "Sem descrição"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge
                    variant={d.ativo ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {d.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                  <ChevronRight size={12} className="text-gray-300" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Painel direito: formulário ── */}
      <div
        className={`flex flex-col bg-gray-50 border-l border-gray-200 transition-all duration-300 overflow-hidden ${
          painelAberto ? "flex-1" : "w-0"
        }`}
      >
        {painelAberto && (
          <>
            {/* Cabeçalho */}
            <div className="flex items-start justify-between px-6 py-5 bg-white border-b border-gray-100">
              <div>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-0.5">
                  {modo === "criar"
                    ? "NOVO DEPARTAMENTO"
                    : "EDITANDO DEPARTAMENTO"}
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

            {/* Campos */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {/* Nome */}
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

              {/* Descrição */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Descrição
                </Label>
                <Textarea
                  value={form.descricao}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, descricao: e.target.value }))
                  }
                  rows={4}
                  placeholder="Descreva as responsabilidades deste departamento..."
                  className="resize-none text-sm bg-white"
                />
              </div>

              {/* Status Ativo/Inativo */}
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
                  {form.ativo ? "Ativo" : "Inativo"}
                </button>
              </div>

              {erro && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {erro}
                </p>
              )}
            </div>

            {/* Confirmação de exclusão */}
            {confirmarExclusao && (
              <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700 mb-1">
                  Confirmar exclusão
                </p>
                <p className="text-xs text-red-500 mb-3">
                  Esta ação é irreversível. Usuários vinculados ao departamento
                  serão desvinculados.
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
