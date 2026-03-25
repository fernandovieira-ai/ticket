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
  Building2,
  ChevronRight,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Cliente } from "@/types";

type Modo = "criar" | "editar";
type Tipo = "J" | "F";

function mascaraDocumento(digits: string, tipo: Tipo): string {
  if (tipo === "F") {
    // CPF: 000.000.000-00
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3}\.\d{3}\.\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    // CNPJ: 00.000.000/0001-00
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d{1,2})$/, "$1-$2");
  }
}

const formVazio = {
  nome_razao: "",
  tipo: "J" as Tipo,
  documento: "",
  email: "",
  telefone: "",
  segmento: "",
  observacoes: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  ativo: true,
  ind_pre_cadastro: false,
};

export function ClientesClient() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const primeiroRender = useRef(true);

  const [painelAberto, setPainelAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("criar");
  const [selecionado, setSelecionado] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio);

  function handleDocumentoChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    let novoTipo: Tipo = form.tipo;
    if (digits.length === 11) novoTipo = "F";
    else if (digits.length > 11) novoTipo = "J";
    const masked = mascaraDocumento(digits, novoTipo);
    setForm((f) => ({ ...f, documento: masked, tipo: novoTipo }));
  }

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: busca, pageSize: "50" });
      const res = await fetch(`/api/clientes?${params}`);
      const data = await res.json();
      setClientes(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [busca]);

  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false;
      carregar();
      return;
    }
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

  function abrirCliente(c: Cliente) {
    setModo("editar");
    setSelecionado(c);
    const tipoCliente = (c.tipo ?? "J") as Tipo;
    const docDigits = (c.documento ?? "").replace(/\D/g, "").slice(0, 14);
    const docMasked = docDigits ? mascaraDocumento(docDigits, tipoCliente) : "";
    setForm({
      nome_razao: c.nome_razao,
      tipo: tipoCliente,
      documento: docMasked,
      email: c.email ?? "",
      telefone: c.telefone ?? "",
      segmento: c.segmento ?? "",
      observacoes: c.observacoes ?? "",
      cep: c.cep ?? "",
      logradouro: c.logradouro ?? "",
      numero: c.numero ?? "",
      complemento: c.complemento ?? "",
      bairro: c.bairro ?? "",
      cidade: c.cidade ?? "",
      uf: c.uf ?? "",
      ativo: c.ativo ?? true,
      ind_pre_cadastro: c.ind_pre_cadastro ?? false,
    });
    setErro("");
    setPainelAberto(true);
  }

  async function salvar() {
    if (!form.nome_razao) {
      setErro("Nome / Razão social é obrigatório");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const url =
        modo === "criar" ? "/api/clientes" : `/api/clientes/${selecionado?.id}`;
      const method = modo === "criar" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_razao: form.nome_razao,
          tipo: form.tipo,
          documento: form.documento || null,
          email: form.email || null,
          telefone: form.telefone || null,
          segmento: form.segmento || null,
          observacoes: form.observacoes || null,
          cep: form.cep || null,
          logradouro: form.logradouro || null,
          numero: form.numero || null,
          complemento: form.complemento || null,
          bairro: form.bairro || null,
          cidade: form.cidade || null,
          uf: form.uf || null,
          ativo: form.ativo,
          ind_pre_cadastro: form.ind_pre_cadastro,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao salvar");
        return;
      }
      if (modo === "criar") {
        toast.success("Cliente cadastrado com sucesso!");
        setPainelAberto(false);
        setSelecionado(null);
        setForm(formVazio);
      } else {
        toast.success("Cliente atualizado com sucesso!");
        setModo("editar");
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
      const res = await fetch(`/api/clientes/${selecionado.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao excluir");
        setConfirmarExclusao(false);
        return;
      }
      toast.success("Cliente excluído com sucesso!");
      setConfirmarExclusao(false);
      setPainelAberto(false);
      setSelecionado(null);
      carregar();
    } finally {
      setExcluindo(false);
    }
  }

  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("CEP inválido (deve ter 8 dígitos)");
      return;
    }
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setForm((f) => ({
        ...f,
        logradouro: data.logradouro ?? f.logradouro,
        bairro: data.bairro ?? f.bairro,
        cidade: data.localidade ?? f.cidade,
        uf: data.uf ?? f.uf,
      }));
      toast.success("Endereço preenchido!");
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setBuscandoCep(false);
    }
  }

  async function buscarCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ inválido (deve ter 14 dígitos)");
      return;
    }
    setBuscandoCnpj(true);
    try {
      const res = await fetch(`/api/cnpj/${digits}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "CNPJ não encontrado");
        return;
      }
      setForm((f) => ({
        ...f,
        nome_razao: data.razao_social ?? f.nome_razao,
        email: data.email ?? f.email,
        telefone: data.ddd_telefone_1
          ? data.ddd_telefone_1.trim().replace(/^(\d{2})\s*(\d+)$/, "($1) $2")
          : f.telefone,
        cep: data.cep ? data.cep.replace(/\D/g, "") : f.cep,
        logradouro: data.logradouro ?? f.logradouro,
        numero: data.numero ?? f.numero,
        complemento: data.complemento ?? f.complemento,
        bairro: data.bairro ?? f.bairro,
        cidade: data.municipio ?? f.cidade,
        uf: data.uf ?? f.uf,
      }));
      toast.success("Dados do CNPJ preenchidos!");
    } catch {
      toast.error("Erro ao buscar CNPJ");
    } finally {
      setBuscandoCnpj(false);
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
          {/* Botão Novo Cliente */}
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
                  Novo cliente
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

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              placeholder="Buscar por nome, CNPJ..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-2">{total} cliente(s)</p>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                    <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum cliente</p>
            </div>
          ) : painelAberto ? (
            /* ── Modo compacto: painel lateral aberto ── */
            clientes.map((c) => (
              <button
                key={c.id}
                onClick={() => abrirCliente(c)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left border-b border-gray-50 transition-colors group ${
                  selecionado?.id === c.id && painelAberto
                    ? "bg-blue-50 border-r-2 border-r-blue-500"
                    : "hover:bg-gray-50"
                } ${!c.ativo ? "opacity-50" : ""}`}
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-blue-600">
                    {c.nome_razao.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium truncate ${selecionado?.id === c.id && painelAberto ? "text-blue-700" : "text-gray-900"}`}
                  >
                    {c.nome_razao}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {c.documento ?? c.email ?? "Sem contato"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {c.ind_pre_cadastro && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 bg-amber-50"
                    >
                      Pré
                    </Badge>
                  )}
                  <Badge
                    variant={c.ativo ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {c.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                  <ChevronRight size={12} className="text-gray-300" />
                </div>
              </button>
            ))
          ) : (
            /* ── Modo tabela: lista completa ── */
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-[11px] font-semibold text-gray-500 px-4 py-2">
                    Nome / Razão Social
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 px-4 py-2 whitespace-nowrap">
                    CNPJ / CPF
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 px-4 py-2 whitespace-nowrap">
                    Telefone
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 px-4 py-2 whitespace-nowrap">
                    E-mail
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 px-4 py-2 whitespace-nowrap">
                    Status
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 px-4 py-2 whitespace-nowrap">
                    Cadastro
                  </th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => abrirCliente(c)}
                    className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${!c.ativo ? "opacity-50" : ""}`}
                  >
                    {/* Nome */}
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-bold text-blue-600">
                            {c.nome_razao.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[13px] font-medium text-gray-900 truncate">
                          {c.nome_razao}
                        </p>
                      </div>
                    </td>
                    {/* CNPJ/CPF */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[12px] text-gray-600">
                        {c.documento ?? (
                          <span className="text-gray-300">—</span>
                        )}
                      </span>
                    </td>
                    {/* Telefone */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[12px] text-gray-600">
                        {c.telefone ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                    {/* E-mail */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <span
                        className="text-[12px] text-gray-600 truncate block"
                        title={c.email ?? ""}
                      >
                        {c.email ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge
                        variant={c.ativo ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {c.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    {/* Cadastro */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.ind_pre_cadastro ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 bg-amber-50"
                        >
                          Pré-cadastro
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-green-600 border-green-300 bg-green-50"
                        >
                          Completo
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Painel direito: formulário (desliza da direita) ── */}
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
                  {modo === "criar" ? "NOVO CLIENTE" : "EDITANDO CLIENTE"}
                </p>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">
                  {modo === "criar" ? "Novo cadastro" : form.nome_razao || "—"}
                </h2>
                {selecionado?.documento && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selecionado.documento}
                  </p>
                )}
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
              {/* Tipo de pessoa */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Tipo de pessoa
                </Label>
                <div className="flex gap-2">
                  {(["J", "F"] as Tipo[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo: t }))}
                      className="flex-1 h-9 rounded-lg border text-sm font-medium transition-colors"
                      style={
                        form.tipo === t
                          ? {
                              backgroundColor: "var(--color-brand)",
                              borderColor: "var(--color-brand)",
                              color: "#FFFFFF",
                            }
                          : {
                              backgroundColor: "#FFFFFF",
                              borderColor: "var(--color-border)",
                              color: "var(--color-text-muted)",
                            }
                      }
                    >
                      {t === "J" ? "Jurídica (CNPJ)" : "Física (CPF)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Razão Social / Nome */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {form.tipo === "J" ? "Razão Social" : "Nome"}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.nome_razao}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nome_razao: e.target.value }))
                  }
                  placeholder={
                    form.tipo === "J"
                      ? "Ex: Empresa XPTO Ltda"
                      : "Ex: João da Silva"
                  }
                  className="h-9 bg-white"
                />
              </div>

              {/* CNPJ/CPF + Segmento */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    {form.tipo === "J" ? "CNPJ" : "CPF"}
                  </Label>
                  <div className="flex gap-1.5">
                    <Input
                      value={form.documento}
                      onChange={(e) => handleDocumentoChange(e.target.value)}
                      placeholder={
                        form.tipo === "J"
                          ? "00.000.000/0001-00"
                          : "000.000.000-00"
                      }
                      className="h-9 bg-white"
                    />
                    {form.tipo === "J" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => buscarCnpj(form.documento)}
                        disabled={buscandoCnpj}
                        className="h-9 px-2.5 flex-shrink-0"
                        title="Buscar dados pelo CNPJ"
                      >
                        {buscandoCnpj ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Segmento
                  </Label>
                  <Input
                    value={form.segmento}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, segmento: e.target.value }))
                    }
                    placeholder="Ex: Varejo..."
                    className="h-9 bg-white"
                  />
                </div>
              </div>

              {/* E-mail + Telefone */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    E-mail
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    placeholder="contato@empresa.com.br"
                    className="h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    Telefone
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="#25D366"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                  </Label>
                  <Input
                    value={form.telefone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, telefone: e.target.value }))
                    }
                    placeholder="(34) 3497-3700"
                    className="h-9 bg-white"
                  />
                </div>
              </div>

              {/* Endereço */}
              <div className="pt-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Endereço
                </p>
                <div className="space-y-3">
                  {/* CEP */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      CEP
                    </Label>
                    <div className="flex gap-1.5 w-48">
                      <Input
                        value={form.cep}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, cep: e.target.value }))
                        }
                        placeholder="00000-000"
                        maxLength={9}
                        className="h-9 bg-white"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => buscarCep(form.cep)}
                        disabled={buscandoCep}
                        className="h-9 px-2.5 flex-shrink-0"
                        title="Buscar endereço pelo CEP"
                      >
                        {buscandoCep ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Logradouro + Número */}
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Logradouro
                      </Label>
                      <Input
                        value={form.logradouro}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, logradouro: e.target.value }))
                        }
                        placeholder="Rua, Av, Trav..."
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="w-24 space-y-1.5">
                      <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Número
                      </Label>
                      <Input
                        value={form.numero}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, numero: e.target.value }))
                        }
                        placeholder="123"
                        className="h-9 bg-white"
                      />
                    </div>
                  </div>

                  {/* Complemento */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Complemento
                    </Label>
                    <Input
                      value={form.complemento}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, complemento: e.target.value }))
                      }
                      placeholder="Sala, Bloco, Apt..."
                      className="h-9 bg-white"
                    />
                  </div>

                  {/* Bairro + Cidade + UF */}
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Bairro
                      </Label>
                      <Input
                        value={form.bairro}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, bairro: e.target.value }))
                        }
                        placeholder="Centro..."
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Cidade
                      </Label>
                      <Input
                        value={form.cidade}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, cidade: e.target.value }))
                        }
                        placeholder="Uberlândia..."
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="w-16 space-y-1.5">
                      <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        UF
                      </Label>
                      <Input
                        value={form.uf}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            uf: e.target.value.toUpperCase().slice(0, 2),
                          }))
                        }
                        placeholder="MG"
                        maxLength={2}
                        className="h-9 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Ativo/Inativo + Pré-cadastro */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
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
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, ind_pre_cadastro: !f.ind_pre_cadastro }))}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      form.ind_pre_cadastro
                        ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${form.ind_pre_cadastro ? "bg-amber-500" : "bg-gray-400"}`}
                    />
                    {form.ind_pre_cadastro ? "Pré-cadastro" : "Cadastro completo"}
                  </button>
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Observações
                </Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, observacoes: e.target.value }))
                  }
                  rows={3}
                  placeholder="Informações adicionais..."
                  className="resize-none text-sm bg-white"
                />
              </div>

              {erro && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {erro}
                </p>
              )}
            </div>

            {/* Diálogo de confirmação de exclusão */}
            {confirmarExclusao && (
              <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700 mb-1">
                  Confirmar exclusão
                </p>
                <p className="text-xs text-red-500 mb-3">
                  Esta ação é irreversível. Todos os contatos e tickets
                  vinculados serão afetados.
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
