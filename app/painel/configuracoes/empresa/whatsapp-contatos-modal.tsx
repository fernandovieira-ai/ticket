"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Plus,
  Trash2,
  MessageCircle,
  Phone,
  Users,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Departamento, Usuario, WhatsappContato } from "@/types";

type UsuarioItem = Pick<
  Usuario,
  "id" | "nome" | "email" | "perfil" | "telefone" | "ativo"
>;

interface Props {
  open: boolean;
  onClose: () => void;
  empresaId: string;
  empresaNome: string;
}

const formVazio = {
  numero: "", // apenas dígitos após o 55 fixo
  nome: "",
  usuarios_id: "",
  usuarioNome: "",
  id_departamentos: "",
  deptNome: "",
};

export function WhatsappContatosModal({
  open,
  onClose,
  empresaId,
  empresaNome,
}: Props) {
  const [contatos, setContatos] = useState<WhatsappContato[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState("");

  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [buscaDept, setBuscaDept] = useState("");
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [deptAberto, setDeptAberto] = useState(false);

  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [buscaUser, setBuscaUser] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userAberto, setUserAberto] = useState(false);

  const carregarDepartamentos = useCallback(async (q: string) => {
    setLoadingDepts(true);
    try {
      const res = await fetch(
        `/api/departamentos?q=${encodeURIComponent(q)}&pageSize=20`,
      );
      const data = await res.json();
      setDepartamentos(data.data ?? []);
    } finally {
      setLoadingDepts(false);
    }
  }, []);

  const carregarUsuarios = useCallback(async (q: string) => {
    setLoadingUsers(true);
    try {
      const res = await fetch(
        `/api/usuarios?q=${encodeURIComponent(q)}&pageSize=50`,
      );
      const data = await res.json();
      const filtrados = (data.data ?? []).filter(
        (u: Usuario) =>
          ["admin", "supervisor", "operador"].includes(u.perfil) && u.ativo,
      );
      setUsuarios(filtrados);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (!deptAberto) return;
    const t = setTimeout(() => carregarDepartamentos(buscaDept), 300);
    return () => clearTimeout(t);
  }, [buscaDept, deptAberto, carregarDepartamentos]);

  useEffect(() => {
    if (!userAberto) return;
    const t = setTimeout(() => carregarUsuarios(buscaUser), 300);
    return () => clearTimeout(t);
  }, [buscaUser, userAberto, carregarUsuarios]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/whatsapp-contatos`);
      if (res.ok) {
        const data = await res.json();
        setContatos(data);
      }
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (open) {
      carregar();
      setForm(formVazio);
      setErro("");
      setDeptAberto(false);
      setBuscaDept("");
      setUserAberto(false);
      setBuscaUser("");
    }
  }, [open, carregar]);

  async function adicionar() {
    const numero = "55" + form.numero.replace(/\D/g, "");
    if (numero.length < 10) {
      setErro("Informe um número válido (DDD + número)");
      return;
    }
    if (!form.usuarios_id) {
      setErro("Selecione um usuário");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/empresas/${empresaId}/whatsapp-contatos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero,
          nome: form.nome || null,
          id_departamentos: form.id_departamentos || null,
          usuarios_id: form.usuarios_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao adicionar");
        return;
      }
      toast.success("Contato adicionado!");
      setForm(formVazio);
      setBuscaDept("");
      setBuscaUser("");
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    setExcluindoId(id);
    try {
      const res = await fetch(
        `/api/empresas/${empresaId}/whatsapp-contatos/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Erro ao remover");
        return;
      }
      toast.success("Contato removido!");
      setContatos((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setExcluindoId(null);
    }
  }

  function formatarNumero(numero: string) {
    const d = numero.replace(/\D/g, "");
    if (d.length === 13)
      return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12)
      return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    return numero;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <MessageCircle size={16} className="text-green-600" />
            </div>
            <div>
              <DialogTitle>Contatos WhatsApp</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {empresaNome} — números que receberão notificações de chamados
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Formulário para adicionar */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Adicionar número
          </p>

          {/* Buscar usuário */}
          <div className="space-y-1">
            <Label className="text-[11px] text-gray-500">
              Usuário <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserAberto((v) => !v);
                  if (!userAberto) carregarUsuarios(buscaUser);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 h-9 rounded-lg border border-gray-200 bg-white text-sm text-left hover:bg-gray-50 transition-colors"
              >
                <Users size={13} className="text-gray-400 flex-shrink-0" />
                <span
                  className={
                    form.usuarios_id ? "text-gray-900" : "text-gray-400"
                  }
                >
                  {form.usuarios_id
                    ? form.usuarioNome
                    : "Selecionar usuário..."}
                </span>
                {form.usuarios_id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm((f) => ({
                        ...f,
                        usuarios_id: "",
                        usuarioNome: "",
                        nome: "",
                        numero: "",
                      }));
                    }}
                    className="ml-auto text-gray-400 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </button>

              {userAberto && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input
                        autoFocus
                        placeholder="Buscar por nome ou e-mail..."
                        value={buscaUser}
                        onChange={(e) => setBuscaUser(e.target.value)}
                        className="pl-7 h-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {loadingUsers ? (
                      <div className="flex justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      </div>
                    ) : usuarios.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">
                        Nenhum usuário encontrado
                      </p>
                    ) : (
                      usuarios.map((u) => {
                        const tel = (u.telefone ?? "").replace(/\D/g, "");
                        const numLocal = tel.startsWith("55")
                          ? tel.slice(2)
                          : tel;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setForm((f) => ({
                                ...f,
                                usuarios_id: u.id,
                                usuarioNome: u.nome,
                                nome: u.nome,
                                numero: numLocal,
                              }));
                              setUserAberto(false);
                              setBuscaUser("");
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 transition-colors ${
                              form.usuarios_id === u.id ? "bg-blue-50" : ""
                            }`}
                          >
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-blue-600">
                              {u.nome.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">
                                {u.nome}
                              </p>
                              <p className="text-[10px] text-gray-400 truncate">
                                {u.telefone ?? (
                                  <span className="text-orange-400">
                                    sem telefone
                                  </span>
                                )}
                                {" · "}
                                <span className="capitalize">{u.perfil}</span>
                              </p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Número com prefixo 55 fixo */}
          <div className="space-y-1">
            <Label className="text-[11px] text-gray-500">
              Número WhatsApp <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center h-9 rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
              <span className="px-3 text-sm font-semibold text-gray-500 bg-gray-50 border-r border-gray-200 h-full flex items-center select-none">
                +55
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={form.numero}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    numero: e.target.value.replace(/\D/g, ""),
                  }))
                }
                placeholder="11999999999"
                className="flex-1 h-full px-3 text-sm outline-none bg-transparent"
                maxLength={13}
              />
            </div>
          </div>

          {/* Departamento */}
          <div className="space-y-1">
            <Label className="text-[11px] text-gray-500">Departamento</Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setDeptAberto((v) => !v);
                  if (!deptAberto) carregarDepartamentos(buscaDept);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 h-9 rounded-lg border border-gray-200 bg-white text-sm text-left hover:bg-gray-50 transition-colors"
              >
                <Users size={13} className="text-gray-400 flex-shrink-0" />
                <span
                  className={
                    form.id_departamentos ? "text-gray-900" : "text-gray-400"
                  }
                >
                  {form.id_departamentos
                    ? form.deptNome
                    : "Todos os departamentos"}
                </span>
                {form.id_departamentos && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm((f) => ({
                        ...f,
                        id_departamentos: "",
                        deptNome: "",
                      }));
                    }}
                    className="ml-auto text-gray-400 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </button>

              {deptAberto && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input
                        autoFocus
                        placeholder="Buscar departamento..."
                        value={buscaDept}
                        onChange={(e) => setBuscaDept(e.target.value)}
                        className="pl-7 h-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {loadingDepts ? (
                      <div className="flex justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      </div>
                    ) : departamentos.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">
                        Nenhum departamento
                      </p>
                    ) : (
                      departamentos.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({
                              ...f,
                              id_departamentos: d.id,
                              deptNome: d.nome,
                            }));
                            setDeptAberto(false);
                            setBuscaDept("");
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 transition-colors ${
                            form.id_departamentos === d.id
                              ? "bg-blue-50 text-blue-700 font-medium"
                              : "text-gray-700"
                          }`}
                        >
                          <Users
                            size={12}
                            className="text-gray-400 flex-shrink-0"
                          />
                          {d.nome}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-400">
              Deixe em branco para receber todos os chamados
            </p>
          </div>
          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}
          <Button
            size="sm"
            onClick={adicionar}
            disabled={salvando || !form.numero || !form.usuarios_id}
            className="h-8 text-xs"
          >
            {salvando ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <Plus size={13} className="mr-1.5" />
            )}
            Adicionar
          </Button>
        </div>

        {/* Lista de contatos */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : contatos.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Phone size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum número cadastrado</p>
            </div>
          ) : (
            contatos.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 bg-white group"
              >
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Phone size={13} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {formatarNumero(c.numero)}
                  </p>
                  {c.nome && (
                    <p className="text-[11px] text-gray-400 truncate">
                      {c.nome}
                    </p>
                  )}
                  {c.id_departamentos && (
                    <p className="text-[10px] text-blue-500 truncate flex items-center gap-1">
                      <Users size={10} />
                      Dept. específico
                    </p>
                  )}
                </div>
                <button
                  onClick={() => remover(c.id)}
                  disabled={excluindoId === c.id}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                  {excluindoId === c.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {contatos.length > 0 && (
          <p className="text-[10px] text-gray-400 text-center">
            {contatos.length} número(s) cadastrado(s)
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
