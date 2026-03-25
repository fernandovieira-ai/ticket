"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  Building2,
  ChevronRight,
  X,
  Trash2,
  Upload,
  MessageCircle,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { Departamento, Empresa } from "@/types";
import { WhatsappContatosModal } from "./whatsapp-contatos-modal";

type Modo = "criar" | "editar";

const FUSOS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Maceio",
  "America/Bahia",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
];

const IDIOMAS = [
  { value: "pt-BR", label: "PortuguÃªs (Brasil)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "EspaÃ±ol (Espanha)" },
];

const formVazio = {
  nome: "",
  dominio: "",
  logo_url: "",
  fuso_horario: "America/Sao_Paulo",
  idioma: "pt-BR",
  prefixo_ticket: "TK",
};

export function EmpresaClient() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  const [painelAberto, setPainelAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("criar");
  const [selecionada, setSelecionada] = useState<Empresa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [uploadandoLogo, setUploadandoLogo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [modalWhatsapp, setModalWhatsapp] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: busca });
      const res = await fetch(`/api/empresas?${params}`);
      const data = await res.json();
      setEmpresas(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, 300);
    return () => clearTimeout(t);
  }, [carregar]);

  function abrirNova() {
    setModo("criar");
    setSelecionada(null);
    setForm(formVazio);
    setErro("");
    setConfirmarExclusao(false);
    setPainelAberto(true);
  }

  function abrirEmpresa(e: Empresa) {
    setModo("editar");
    setSelecionada(e);
    setForm({
      nome: e.nome,
      dominio: e.dominio ?? "",
      logo_url: e.logo_url ?? "",
      fuso_horario: e.fuso_horario,
      idioma: e.idioma,
      prefixo_ticket: e.prefixo_ticket,
    });
    setErro("");
    setConfirmarExclusao(false);
    setPainelAberto(true);
  }

  async function salvar() {
    if (!form.nome.trim()) {
      setErro("Nome da empresa Ã© obrigatÃ³rio");
      return;
    }
    if (!form.prefixo_ticket.trim()) {
      setErro("Prefixo do ticket Ã© obrigatÃ³rio");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const url =
        modo === "criar" ? "/api/empresas" : `/api/empresas/${selecionada?.id}`;
      const method = modo === "criar" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          dominio: form.dominio || null,
          logo_url: form.logo_url || null,
          fuso_horario: form.fuso_horario,
          idioma: form.idioma,
          prefixo_ticket: form.prefixo_ticket,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao salvar");
        return;
      }
      if (modo === "criar") {
        toast.success("Empresa cadastrada com sucesso!");
        setPainelAberto(false);
        setSelecionada(null);
        setForm(formVazio);
      } else {
        toast.success("Empresa atualizada com sucesso!");
        setSelecionada(data);
      }
      carregar();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadandoLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao enviar imagem");
        return;
      }
      setForm((f) => ({ ...f, logo_url: data.url }));
    } finally {
      setUploadandoLogo(false);
      e.target.value = "";
    }
  }

  async function excluir() {
    if (!selecionada) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/empresas/${selecionada.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao excluir");
        setConfirmarExclusao(false);
        return;
      }
      toast.success("Empresa excluÃ­da com sucesso!");
      setConfirmarExclusao(false);
      setPainelAberto(false);
      setSelecionada(null);
      carregar();
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <>
      <div className="flex gap-0 h-full -mx-6 -mb-6">
        {/* â”€â”€ Coluna esquerda: lista â”€â”€ */}
        <div
          className={`flex flex-col bg-white border-r border-gray-200 transition-[width,flex] duration-200 ${
            painelAberto ? "w-72 min-w-[288px]" : "flex-1"
          }`}
        >
          <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100">
            {/* BotÃ£o Nova Empresa */}
            <button
              onClick={abrirNova}
              className="w-full flex items-center justify-between bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-3.5 mb-4 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Plus size={15} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold leading-tight">
                    Nova empresa
                  </p>
                  {!painelAberto && (
                    <p className="text-xs text-blue-200 leading-tight">
                      Cadastrar no sistema
                    </p>
                  )}
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-blue-200 group-hover:translate-x-0.5 transition-transform flex-shrink-0"
              />
            </button>

            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                placeholder="Buscar por nome, domÃ­nio..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-2">{total} empresa(s)</p>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : empresas.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Building2 size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">Nenhuma empresa</p>
              </div>
            ) : (
              empresas.map((e) => (
                <button
                  key={e.id}
                  onClick={() => abrirEmpresa(e)}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left border-b border-gray-50 transition-colors group ${
                    selecionada?.id === e.id && painelAberto
                      ? "bg-blue-50 border-r-2 border-r-blue-500"
                      : "hover:bg-gray-50"
                  } ${!e.ativo ? "opacity-50" : ""}`}
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    {e.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.logo_url}
                        alt={e.nome}
                        className="w-6 h-6 object-contain rounded-full"
                        onError={(ev) => {
                          (ev.target as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : (
                      <span className="text-xs font-bold text-blue-600">
                        {e.nome.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate ${
                        selecionada?.id === e.id && painelAberto
                          ? "text-blue-700"
                          : "text-gray-900"
                      }`}
                    >
                      {e.nome}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {e.dominio ?? e.prefixo_ticket}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge
                      variant={e.ativo ? "default" : "secondary"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {e.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                    <ChevronRight size={12} className="text-gray-300" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* â”€â”€ Painel direito: formulÃ¡rio â”€â”€ */}
        <div
          className={`flex flex-col bg-gray-50 border-l border-gray-200 transition-[width,flex] duration-200 overflow-hidden ${
            painelAberto ? "flex-1" : "w-0"
          }`}
        >
          {painelAberto && (
            <>
              {/* CabeÃ§alho */}
              <div className="flex items-start justify-between px-6 py-5 bg-white border-b border-gray-100">
                <div>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-0.5">
                    {modo === "criar" ? "NOVA EMPRESA" : "EDITANDO EMPRESA"}
                  </p>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">
                    {modo === "criar" ? "Novo cadastro" : form.nome || "â€”"}
                  </h2>
                  {selecionada?.dominio && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selecionada.dominio}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setPainelAberto(false);
                    setSelecionada(null);
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
                    Nome da empresa <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.nome}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nome: e.target.value }))
                    }
                    placeholder="Ex: Digital RF Tecnologia"
                    className="h-9 bg-white"
                  />
                </div>

                {/* DomÃ­nio e Prefixo */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      DomÃ­nio
                    </Label>
                    <Input
                      value={form.dominio}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dominio: e.target.value }))
                      }
                      placeholder="empresa.com.br"
                      className="h-9 bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Prefixo ticket <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={form.prefixo_ticket}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          prefixo_ticket: e.target.value
                            .toUpperCase()
                            .slice(0, 10),
                        }))
                      }
                      placeholder="TK"
                      className="h-9 bg-white"
                      maxLength={10}
                    />
                  </div>
                </div>

                {/* Fuso horÃ¡rio */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Fuso horÃ¡rio
                  </Label>
                  <Select
                    value={form.fuso_horario}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        fuso_horario: v ?? f.fuso_horario,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FUSOS.map((fuso) => (
                        <SelectItem key={fuso} value={fuso}>
                          {fuso}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Idioma */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Idioma
                  </Label>
                  <Select
                    value={form.idioma}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, idioma: v ?? f.idioma }))
                    }
                  >
                    <SelectTrigger className="h-9 bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IDIOMAS.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Logotipo */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Logotipo
                  </Label>
                  <div className="flex items-center gap-3">
                    {/* Preview */}
                    <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {form.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={form.logo_url}
                          alt="Logo"
                          className="w-12 h-12 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <Building2 size={20} className="text-gray-300" />
                      )}
                    </div>
                    {/* Botão upload */}
                    <div className="flex-1 space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer w-fit bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors">
                        {uploadandoLogo ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Upload size={13} />
                        )}
                        {uploadandoLogo ? "Enviando..." : "Enviar imagem"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                          className="hidden"
                          disabled={uploadandoLogo}
                          onChange={handleUploadLogo}
                        />
                      </label>
                      <p className="text-[10px] text-gray-400">
                        PNG, JPG, SVG ou WebP · máx 2MB
                      </p>
                      {form.logo_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, logo_url: "" }))
                          }
                          className="text-[10px] text-red-500 hover:text-red-700"
                        >
                          Remover logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* WhatsApp */}
                {modo === "editar" && selecionada && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Notificações WhatsApp
                    </Label>
                    <button
                      type="button"
                      onClick={() => setModalWhatsapp(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <MessageCircle size={15} className="text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700">
                          Gerenciar contatos
                        </p>
                        <p className="text-[11px] text-gray-400">
                          Números que recebem alertas de chamados e SLA
                        </p>
                      </div>
                      <ChevronRight
                        size={14}
                        className="text-gray-300 flex-shrink-0"
                      />
                    </button>
                  </div>
                )}

                {erro && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {erro}
                  </p>
                )}
              </div>

              {/* DiÃ¡logo de confirmaÃ§Ã£o de exclusÃ£o */}
              {confirmarExclusao && (
                <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700 mb-1">
                    Confirmar exclusÃ£o
                  </p>
                  <p className="text-xs text-red-500 mb-3">
                    Esta aÃ§Ã£o Ã© irreversÃ­vel. Todos os dados vinculados Ã 
                    empresa serÃ£o afetados.
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

              {/* RodapÃ© */}
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
                      setSelecionada(null);
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

      {selecionada && (
        <WhatsappContatosModal
          open={modalWhatsapp}
          onClose={() => setModalWhatsapp(false)}
          empresaId={selecionada.id}
          empresaNome={selecionada.nome}
        />
      )}
    </>
  );
}
