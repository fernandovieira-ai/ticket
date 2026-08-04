"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Users,
  ChevronRight,
  X,
  Trash2,
  Building2,
  UserCircle2,
  Phone,
  LayoutList,
  Table2,
  Columns,
  Check,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import type {
  UsuarioSemSenha,
  PerfilUsuario,
  Departamento,
  Cliente,
} from "@/types";

type Modo = "criar" | "editar";
type Aba = "dados" | "departamento" | "clientes";
type ModoVisu = "lista" | "grade";

const COLUNAS_GRADE = [
  { key: "nome", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "telefone", label: "Telefone" },
  { key: "perfil", label: "Perfil" },
  { key: "departamento", label: "Departamento" },
  { key: "status", label: "Status" },
] as const;

type ColunaKey = (typeof COLUNAS_GRADE)[number]["key"];

const COLUNAS_PADRAO: ColunaKey[] = [
  "nome",
  "email",
  "telefone",
  "perfil",
  "departamento",
  "status",
];

const PERFIL_LABELS: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  operador: "Operador",
  somente_leitura: "Somente leitura",
  cliente: "Cliente",
};

const PERFIL_CORES: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  supervisor: "bg-purple-100 text-purple-700",
  operador: "bg-blue-100 text-blue-700",
  somente_leitura: "bg-gray-100 text-gray-600",
  cliente: "bg-green-100 text-green-700",
};

const formVazio = {
  nome: "",
  email: "",
  perfil: "operador" as PerfilUsuario,
  telefone: "",
  whatsapp_jid: "",
  password: "",
  ativo: true,
};

type UsuarioComDept = UsuarioSemSenha & { departamento_nome?: string | null };

// Formata telefone para link WhatsApp (remove tudo que não for dígito, adiciona 55 se necessário)
function whatsappLink(telefone: string) {
  const digits = telefone.replace(/\D/g, "");
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${number}`;
}

interface UsuariosClientProps {
  perfilAtual?: string;
  usuariosIniciais?: { data: UsuarioComDept[]; total: number };
  departamentosIniciais?: Departamento[];
}

function UsuariosClientComponent({
  perfilAtual = "operador",
  usuariosIniciais,
  departamentosIniciais
}: UsuariosClientProps) {
  const [usuarios, setUsuarios] = useState<UsuarioComDept[]>(usuariosIniciais?.data || []);
  const [total, setTotal] = useState(usuariosIniciais?.total || 0);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(!usuariosIniciais);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(!!usuariosIniciais);
  const [modoVisu, setModoVisu] = useState<ModoVisu>("grade");
  const [abaLista, setAbaLista] = useState<"atendentes" | "clientes">("atendentes");
  const [colunasVisiveis, setColunasVisiveis] = useState<Set<ColunaKey>>(
    new Set(COLUNAS_PADRAO),
  );
  const [menuColunas, setMenuColunas] = useState(false);
  const menuColunasRef = useRef<HTMLDivElement>(null);

  // todos os departamentos disponíveis
  const [departamentos, setDepartamentos] = useState<Departamento[]>(departamentosIniciais || []);
  // departamentos já vinculados ao usuário selecionado
  const [deptsVinculados, setDeptsVinculados] = useState<Departamento[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [deptParaAdicionar, setDeptParaAdicionar] = useState("");
  const [vinculando, setVinculando] = useState(false);

  // clientes
  type ClienteVinculado = Cliente & { grupo_whatsapp: string | null; filial: string | null };
  const [clientesVinculados, setClientesVinculados] = useState<ClienteVinculado[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientesDisponiveis, setClientesDisponiveis] = useState<Cliente[]>([]);
  const [loadingBuscaCliente, setLoadingBuscaCliente] = useState(false);
  const [clienteParaAdicionar, setClienteParaAdicionar] = useState("");
  const [vinculandoCliente, setVinculandoCliente] = useState(false);

  const [painelAberto, setPainelAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("dados");
  const [modo, setModo] = useState<Modo>("criar");
  const [selecionado, setSelecionado] = useState<UsuarioComDept | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(formVazio);
  const [uploadandoAvatar, setUploadandoAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // fecha menu de colunas ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuColunasRef.current &&
        !menuColunasRef.current.contains(e.target as Node)
      ) {
        setMenuColunas(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // carrega lista completa de departamentos uma vez (se não foi pré-carregado)
  useEffect(() => {
    if (!departamentosIniciais) {
      fetch("/api/departamentos?pageSize=50")
        .then((r) => r.json())
        .then((d) => setDepartamentos(d.data ?? []))
        .catch(() => {});
    }
  }, [departamentosIniciais]);

  // carrega departamentos do usuário selecionado
  const carregarDeptsVinculados = useCallback(async (usuarioId: string) => {
    setLoadingDepts(true);
    try {
      const res = await fetch(`/api/usuarios/${usuarioId}/departamentos`);
      const data = await res.json();
      setDeptsVinculados(Array.isArray(data) ? data : []);
    } finally {
      setLoadingDepts(false);
    }
  }, []);

  // carrega clientes vinculados ao usuário
  const carregarClientesVinculados = useCallback(async (usuarioId: string) => {
    setLoadingClientes(true);
    try {
      const res = await fetch(`/api/usuarios/${usuarioId}/clientes`);
      const data = await res.json();
      setClientesVinculados(Array.isArray(data) ? data : []);
    } finally {
      setLoadingClientes(false);
    }
  }, []);

  // busca clientes para o select de adição
  useEffect(() => {
    if (!buscaCliente || buscaCliente.length < 2) {
      setClientesDisponiveis([]);
      return;
    }
    setLoadingBuscaCliente(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/clientes?q=${encodeURIComponent(buscaCliente)}&pageSize=20`,
        );
        const data = await res.json();
        setClientesDisponiveis(data.data ?? []);
      } finally {
        setLoadingBuscaCliente(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [buscaCliente]);

  const carregar = useCallback(async () => {
    if (!mountedRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const params = new URLSearchParams({ q: busca, pageSize: "50" });
      const res = await fetch(`/api/usuarios?${params}`);
      const data = await res.json();
      setUsuarios(data.data ?? []);
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

  async function uploadAvatar(file: File) {
    if (!selecionado) return;
    setUploadandoAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/usuarios/${selecionado.id}/avatar`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao enviar foto"); return; }
      setAvatarPreview(data.url);
      setSelecionado((prev) => prev ? { ...prev, avatar_url: data.url } : prev);
      setUsuarios((prev) => prev.map((u) => u.id === selecionado.id ? { ...u, avatar_url: data.url } : u));
      toast.success("Foto atualizada!");
    } finally {
      setUploadandoAvatar(false);
    }
  }

  async function removerAvatar() {
    if (!selecionado) return;
    setUploadandoAvatar(true);
    try {
      const res = await fetch(`/api/usuarios/${selecionado.id}/avatar`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erro ao remover foto"); return; }
      setAvatarPreview(null);
      setSelecionado((prev) => prev ? { ...prev, avatar_url: null } : prev);
      setUsuarios((prev) => prev.map((u) => u.id === selecionado.id ? { ...u, avatar_url: null } : u));
      toast.success("Foto removida!");
    } finally {
      setUploadandoAvatar(false);
    }
  }

  function abrirNovo() {
    setModo("criar");
    setSelecionado(null);
    setForm(formVazio);
    setAvatarPreview(null);
    setDeptsVinculados([]);
    setDeptParaAdicionar("");
    setClientesVinculados([]);
    setClienteParaAdicionar("");
    setBuscaCliente("");
    setErro("");
    setAba("dados");
    setPainelAberto(true);
  }

  function abrirUsuario(u: UsuarioComDept) {
    setModo("editar");
    setSelecionado(u);
    setAvatarPreview(u.avatar_url ?? null);
    setForm({
      nome: u.nome,
      email: u.email,
      perfil: u.perfil as PerfilUsuario,
      telefone: u.telefone ?? "",
      whatsapp_jid: u.whatsapp_jid ?? "",
      password: "",
      ativo: u.ativo ?? true,
    });
    setDeptsVinculados([]);
    setDeptParaAdicionar("");
    setClientesVinculados([]);
    setClienteParaAdicionar("");
    setBuscaCliente("");
    setErro("");
    setAba("dados");
    setPainelAberto(true);
  }

  function handleAba(a: Aba) {
    setAba(a);
    if (!selecionado) return;
    if (a === "departamento") carregarDeptsVinculados(selecionado.id);
    if (a === "clientes") carregarClientesVinculados(selecionado.id);
  }

  async function salvar() {
    if (!form.nome || !form.email) {
      setErro("Nome e e-mail são obrigatórios");
      setAba("dados");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const url =
        modo === "criar" ? "/api/usuarios" : `/api/usuarios/${selecionado?.id}`;
      const method = modo === "criar" ? "POST" : "PATCH";
      const body: Record<string, unknown> = {
        nome: form.nome,
        perfil: form.perfil,
        telefone: form.telefone || null,
      };
      if (perfilAtual === "admin") {
        body.whatsapp_jid = form.whatsapp_jid || null;
      }
      if (modo === "criar") {
        body.email = form.email;
        if (form.password) body.password = form.password;
      } else {
        if (form.password) body.password = form.password;
        body.ativo = form.ativo;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        setErro("Erro interno no servidor. Verifique os logs.");
        return;
      }
      if (!res.ok) {
        setErro((data.error as string) ?? "Erro ao salvar");
        return;
      }
      if (modo === "criar") {
        toast.success("Usuário cadastrado com sucesso!");
        setPainelAberto(false);
        setSelecionado(null);
        setForm(formVazio);
      } else {
        toast.success("Usuário atualizado com sucesso!");
        setSelecionado(data as unknown as UsuarioComDept);
      }
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function vincularDept() {
    if (!deptParaAdicionar || !selecionado) return;
    setVinculando(true);
    try {
      const res = await fetch(`/api/usuarios/${selecionado.id}/departamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departamento_id: deptParaAdicionar }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao vincular");
        return;
      }
      toast.success("Departamento vinculado!");
      setDeptParaAdicionar("");
      carregarDeptsVinculados(selecionado.id);
    } finally {
      setVinculando(false);
    }
  }

  async function desvincularDept(deptId: string) {
    if (!selecionado) return;
    const res = await fetch(
      `/api/usuarios/${selecionado.id}/departamentos/${deptId}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) {
      toast.error("Erro ao desvincular");
      return;
    }
    toast.success("Departamento removido!");
    setDeptsVinculados((prev) => prev.filter((d) => d.id !== deptId));
  }

  async function vincularCliente() {
    if (!clienteParaAdicionar || !selecionado) return;
    setVinculandoCliente(true);
    try {
      const res = await fetch(`/api/usuarios/${selecionado.id}/clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: clienteParaAdicionar }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao vincular");
        return;
      }
      toast.success("Cliente vinculado!");
      setClienteParaAdicionar("");
      setBuscaCliente("");
      setClientesDisponiveis([]);
      carregarClientesVinculados(selecionado.id);
    } finally {
      setVinculandoCliente(false);
    }
  }

  async function desvincularCliente(clienteId: string) {
    if (!selecionado) return;
    const res = await fetch(
      `/api/usuarios/${selecionado.id}/clientes/${clienteId}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) {
      toast.error("Erro ao desvincular");
      return;
    }
    toast.success("Cliente removido!");
    setClientesVinculados((prev) => prev.filter((c) => c.id !== clienteId));
  }

  async function excluir() {
    if (!selecionado) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/usuarios/${selecionado.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao excluir");
        setConfirmarExclusao(false);
        return;
      }
      toast.success("Usuário excluído com sucesso!");
      setConfirmarExclusao(false);
      setPainelAberto(false);
      setSelecionado(null);
      carregar();
    } finally {
      setExcluindo(false);
    }
  }

  function toggleColuna(key: ColunaKey) {
    setColunasVisiveis((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // mínimo 1 coluna
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // departamentos disponíveis para adicionar (exclui já vinculados)
  const deptsDisponiveis = departamentos.filter(
    (d) => !deptsVinculados.some((v) => v.id === d.id),
  );

  // filtra usuários pela aba selecionada
  const usuariosFiltrados = usuarios.filter((u) =>
    abaLista === "clientes" ? u.perfil === "cliente" : u.perfil !== "cliente",
  );

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
                  Novo usuário
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

          {/* Barra de busca + toggle de visualização */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {refreshing && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-gray-300" />
              )}
            </div>

            {/* Botões de visualização — só mostrar quando painel fechado */}
            {!painelAberto && (
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setModoVisu("lista")}
                  title="Visualização em lista"
                  className={`p-1.5 transition-colors ${
                    modoVisu === "lista"
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <LayoutList size={14} />
                </button>
                <button
                  onClick={() => setModoVisu("grade")}
                  title="Visualização em grade"
                  className={`p-1.5 transition-colors ${
                    modoVisu === "grade"
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <Table2 size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Abas Atendentes / Clientes */}
          <div className="flex items-center gap-1 mt-3 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setAbaLista("atendentes")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                abaLista === "atendentes"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Atendentes
            </button>
            <button
              onClick={() => setAbaLista("clientes")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                abaLista === "clientes"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Clientes
            </button>
          </div>

          {/* Linha de contagem + coluna visibility (grade) */}
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-gray-400">{usuariosFiltrados.length} usuário(s)</p>
            {!painelAberto && modoVisu === "grade" && (
              <div className="relative" ref={menuColunasRef}>
                <button
                  onClick={() => setMenuColunas((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-blue-600 transition-colors"
                >
                  <Columns size={12} />
                  Colunas
                </button>
                {menuColunas && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
                    {COLUNAS_GRADE.map((col) => (
                      <button
                        key={col.key}
                        onClick={() => toggleColuna(col.key)}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {col.label}
                        {colunasVisiveis.has(col.key) && (
                          <Check size={11} className="text-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50">
                <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-gray-100 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                </div>
                <div className="w-14 h-5 bg-gray-100 rounded animate-pulse flex-shrink-0" />
              </div>
            ))
          ) : usuariosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum usuário</p>
            </div>
          ) : modoVisu === "lista" || painelAberto ? (
            /* ── MODO LISTA (cards) ── */
            <div className={refreshing ? "opacity-60 transition-opacity duration-150" : ""}>
            {usuariosFiltrados.map((u) => {
              const initials = u.nome
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase();
              return (
                <button
                  key={u.id}
                  onClick={() => abrirUsuario(u)}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left border-b border-gray-50 transition-colors group ${
                    selecionado?.id === u.id && painelAberto
                      ? "bg-blue-50 border-r-2 border-r-blue-500"
                      : "hover:bg-gray-50"
                  } ${!u.ativo ? "opacity-50" : ""}`}
                >
                  {u.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar_url} alt={u.nome} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">{initials}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate ${selecionado?.id === u.id && painelAberto ? "text-blue-700" : "text-gray-900"}`}
                    >
                      {u.nome}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {u.departamento_nome ?? u.email}
                    </p>
                    {u.telefone && !painelAberto && (
                      <p className="text-[11px] text-green-600 truncate flex items-center gap-1 mt-0.5">
                        <Phone size={9} />
                        {u.telefone}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${PERFIL_CORES[u.perfil] ?? ""}`}
                    >
                      {PERFIL_LABELS[u.perfil] ?? u.perfil}
                    </span>
                    <ChevronRight size={12} className="text-gray-300" />
                  </div>
                </button>
              );
            })}
            </div>
          ) : (
            /* ── MODO GRADE (tabela) ── */
            <div className={refreshing ? "opacity-60 transition-opacity duration-150" : ""}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    {COLUNAS_GRADE.filter((c) =>
                      colunasVisiveis.has(c.key),
                    ).map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map((u) => {
                    const initials = u.nome
                      .split(" ")
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase();
                    return (
                      <tr
                        key={u.id}
                        onClick={() => abrirUsuario(u)}
                        className={`border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ${!u.ativo ? "opacity-50" : ""}`}
                      >
                        {colunasVisiveis.has("nome") && (
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {u.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={u.avatar_url} alt={u.nome} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[10px] font-bold text-white">{initials}</span>
                                </div>
                              )}
                              <span className="font-medium text-gray-900 truncate max-w-[160px]">
                                {u.nome}
                              </span>
                            </div>
                          </td>
                        )}
                        {colunasVisiveis.has("email") && (
                          <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap max-w-[180px] truncate">
                            {u.email}
                          </td>
                        )}
                        {colunasVisiveis.has("telefone") && (
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {u.telefone ? (
                              <a
                                href={whatsappLink(u.telefone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg hover:bg-green-100 transition-colors"
                              >
                                {/* WhatsApp icon SVG */}
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                                {u.telefone}
                              </a>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        )}
                        {colunasVisiveis.has("perfil") && (
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${PERFIL_CORES[u.perfil] ?? ""}`}
                            >
                              {PERFIL_LABELS[u.perfil] ?? u.perfil}
                            </span>
                          </td>
                        )}
                        {colunasVisiveis.has("departamento") && (
                          <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                            {u.departamento_nome ?? (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                        {colunasVisiveis.has("status") && (
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                u.ativo
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${u.ativo ? "bg-green-500" : "bg-gray-400"}`}
                              />
                              {u.ativo ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Painel direito ── */}
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
                  {modo === "criar" ? "NOVO USUÁRIO" : "EDITANDO USUÁRIO"}
                </p>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">
                  {modo === "criar" ? "Novo cadastro" : form.nome || "—"}
                </h2>
                {selecionado?.email && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selecionado.email}
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

            {/* Abas */}
            <div className="flex border-b border-gray-200 bg-white px-6">
              {(["dados", "departamento", "clientes"] as Aba[]).map((a) => (
                <button
                  key={a}
                  onClick={() => handleAba(a)}
                  className={`py-2.5 px-1 mr-5 text-xs font-semibold border-b-2 transition-colors ${
                    aba === a
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {a === "dados" ? (
                    "Dados"
                  ) : a === "departamento" ? (
                    <span className="flex items-center gap-1.5">
                      Departamentos
                      {deptsVinculados.length > 0 && (
                        <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {deptsVinculados.length}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      Clientes
                      {clientesVinculados.length > 0 && (
                        <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {clientesVinculados.length}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Conteúdo das abas */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {/* ── ABA: DADOS ── */}
              {aba === "dados" && (
                <>
                  {/* Foto de perfil */}
                  {modo === "editar" && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Foto de perfil
                      </Label>
                      <div className="flex items-center gap-4">
                        {/* Avatar atual */}
                        <div className="relative flex-shrink-0">
                          {avatarPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatarPreview}
                              alt={form.nome}
                              className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
                              {form.nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?"}
                            </div>
                          )}
                          {uploadandoAvatar && (
                            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                              <Loader2 className="w-5 h-5 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        {/* Botões */}
                        <div className="flex flex-col gap-1.5">
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadAvatar(f);
                              e.target.value = "";
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={uploadandoAvatar}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            <Camera size={12} />
                            {avatarPreview ? "Alterar foto" : "Enviar foto"}
                          </button>
                          {avatarPreview && (
                            <button
                              type="button"
                              onClick={removerAvatar}
                              disabled={uploadandoAvatar}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              <X size={12} />
                              Remover
                            </button>
                          )}
                          <p className="text-[10px] text-gray-400">PNG, JPG ou WebP. Máx 2MB.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Nome / Usuário <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={form.nome}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, nome: e.target.value }))
                      }
                      placeholder="Nome do usuário"
                      className="h-9 bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      E-mail <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                      placeholder="email@empresa.com"
                      disabled={modo === "editar"}
                      className="h-9 bg-white disabled:opacity-60"
                    />
                    {modo === "editar" && (
                      <p className="text-[10px] text-gray-400">
                        O e-mail não pode ser alterado.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      {/* WhatsApp icon */}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="#25D366"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      Telefone / WhatsApp
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input
                        type="tel"
                        value={form.telefone}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, telefone: e.target.value }))
                        }
                        placeholder="(11) 99999-9999"
                        className="h-9 bg-white pl-8"
                      />
                    </div>
                    {form.telefone && (
                      <a
                        href={whatsappLink(form.telefone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] text-green-700 hover:text-green-800 transition-colors"
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        Abrir no WhatsApp
                      </a>
                    )}
                  </div>

                  {perfilAtual === "admin" && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        WhatsApp JID
                      </Label>
                      <Input
                        type="text"
                        value={form.whatsapp_jid}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, whatsapp_jid: e.target.value }))
                        }
                        placeholder="263689584308313@lid ou 5511999990000@s.whatsapp.net"
                        className="h-9 bg-white font-mono text-xs"
                      />
                      <p className="text-[11px] text-zinc-400">
                        Usado para vincular mensagens de grupos ao operador. Copie o JID da página Ranking Grupos.
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Perfil
                    </Label>
                    <Select
                      value={form.perfil}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, perfil: v as PerfilUsuario }))
                      }
                    >
                      <SelectTrigger className="h-9 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                        <SelectItem value="operador">Operador</SelectItem>
                        <SelectItem value="somente_leitura">
                          Somente leitura
                        </SelectItem>
                        <SelectItem value="cliente">Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Status
                    </Label>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, ativo: !f.ativo }))
                      }
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

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {modo === "editar" ? "Nova senha (opcional)" : "Senha"}
                    </Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      placeholder="••••••••"
                      className="h-9 bg-white"
                    />
                  </div>
                </>
              )}

              {/* ── ABA: DEPARTAMENTOS ── */}
              {aba === "departamento" && (
                <div className="space-y-4">
                  {modo === "criar" ? (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                      Salve o usuário primeiro para vincular departamentos.
                    </div>
                  ) : (
                    <>
                      {/* Adicionar departamento */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Adicionar departamento
                        </Label>
                        <div className="flex gap-1.5">
                          <Select
                            value={deptParaAdicionar}
                            onValueChange={(v) => setDeptParaAdicionar(v ?? "")}
                          >
                            <SelectTrigger className="h-9 bg-white flex-1">
                              <SelectValue placeholder="Selecione...">
                                {deptParaAdicionar
                                  ? (departamentos.find(
                                      (d) => d.id === deptParaAdicionar,
                                    )?.nome ?? "Selecione...")
                                  : "Selecione..."}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {deptsDisponiveis.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-gray-400">
                                  Todos os departamentos já vinculados
                                </div>
                              ) : (
                                deptsDisponiveis.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.nome}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            onClick={vincularDept}
                            disabled={!deptParaAdicionar || vinculando}
                            className="h-9 px-3 flex-shrink-0"
                          >
                            {vinculando ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Plus size={14} />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Lista de departamentos vinculados */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Vinculados ({deptsVinculados.length})
                        </p>

                        {loadingDepts ? (
                          <div className="flex justify-center py-6">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          </div>
                        ) : deptsVinculados.length === 0 ? (
                          <div className="rounded-xl border border-gray-100 bg-white px-4 py-5 text-center text-gray-400">
                            <Building2
                              size={22}
                              className="mx-auto mb-1.5 opacity-30"
                            />
                            <p className="text-xs">
                              Nenhum departamento vinculado
                            </p>
                          </div>
                        ) : (
                          deptsVinculados.map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-2.5"
                            >
                              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <Building2
                                  size={12}
                                  className="text-indigo-600"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {d.nome}
                                </p>
                                {d.descricao && (
                                  <p className="text-xs text-gray-400 truncate">
                                    {d.descricao}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => desvincularDept(d.id)}
                                title="Remover vínculo"
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── ABA: CLIENTES ── */}
              {aba === "clientes" && (
                <div className="space-y-4">
                  {modo === "criar" ? (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                      Salve o usuário primeiro para vincular clientes.
                    </div>
                  ) : (
                    <>
                      {/* Busca + adicionar cliente */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Adicionar cliente
                        </Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <Input
                            placeholder="Buscar por nome ou CNPJ..."
                            value={buscaCliente}
                            onChange={(e) => {
                              setBuscaCliente(e.target.value);
                              setClienteParaAdicionar("");
                            }}
                            className="pl-8 h-9 bg-white text-sm"
                          />
                          {loadingBuscaCliente && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                          )}
                        </div>

                        {/* Resultados da busca */}
                        {clientesDisponiveis.length > 0 && (
                          <div className="border border-gray-100 rounded-xl overflow-hidden bg-white shadow-sm">
                            {clientesDisponiveis
                              .filter(
                                (c) =>
                                  !clientesVinculados.some(
                                    (v) => v.id === c.id,
                                  ),
                              )
                              .map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setClienteParaAdicionar(c.id);
                                    setBuscaCliente(c.nome_razao);
                                    setClientesDisponiveis([]);
                                  }}
                                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 ${
                                    clienteParaAdicionar === c.id
                                      ? "bg-blue-50"
                                      : ""
                                  }`}
                                >
                                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-bold text-blue-600">
                                      {c.nome_razao.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {c.nome_razao}
                                    </p>
                                    <p className="text-xs text-gray-400 truncate">
                                      {c.documento ?? c.email ?? "—"}
                                    </p>
                                  </div>
                                </button>
                              ))}
                          </div>
                        )}

                        {clienteParaAdicionar && (
                          <Button
                            type="button"
                            onClick={vincularCliente}
                            disabled={vinculandoCliente}
                            className="w-full h-9"
                          >
                            {vinculandoCliente ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Plus size={14} className="mr-1.5" />
                            )}
                            Vincular cliente selecionado
                          </Button>
                        )}
                      </div>

                      {/* Lista de clientes vinculados */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Vinculados ({clientesVinculados.length})
                        </p>

                        {loadingClientes ? (
                          <div className="flex justify-center py-6">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          </div>
                        ) : clientesVinculados.length === 0 ? (
                          <div className="rounded-xl border border-gray-100 bg-white px-4 py-5 text-center text-gray-400">
                            <UserCircle2
                              size={22}
                              className="mx-auto mb-1.5 opacity-30"
                            />
                            <p className="text-xs">Nenhum cliente vinculado</p>
                          </div>
                        ) : (
                          clientesVinculados.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-2.5"
                            >
                              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-bold text-blue-600">
                                  {c.nome_razao.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {c.nome_razao}
                                </p>
                                <p className="text-xs text-gray-400 truncate">
                                  {c.documento ?? c.email ?? "—"}
                                </p>
                                {(c.grupo_whatsapp || c.filial) && (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {c.grupo_whatsapp && (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 truncate max-w-[160px]" title={c.grupo_whatsapp}>
                                        <Phone size={9} /> {c.grupo_whatsapp}
                                      </span>
                                    )}
                                    {c.filial && (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 truncate max-w-[120px]" title={c.filial}>
                                        <Building2 size={9} /> {c.filial}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => desvincularCliente(c.id)}
                                title="Remover vínculo"
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

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
                  Esta ação é irreversível. O usuário perderá acesso ao sistema.
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

            {/* Rodapé — botão Salvar só relevante na aba Dados */}
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
                {aba === "dados" && (
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
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const UsuariosClient = memo(UsuariosClientComponent);
