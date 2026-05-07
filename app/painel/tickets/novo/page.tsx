"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Send,
  ChevronDown,
  Search,
  X as XIcon,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RichTextEditor,
  type RichTextEditorRef,
} from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { toast } from "sonner";

interface Prioridade {
  id: string;
  nome: string;
  cor: string;
}
interface Cliente {
  id: string;
  nome_razao: string;
}
interface Departamento {
  id: string;
  nome: string;
}
interface Categoria {
  id: string;
  nome: string;
}
interface Subcategoria {
  id: string;
  nome: string;
}
interface Usuario {
  id: string;
  nome: string;
  perfil: string;
}

export default function NovoTicketPage() {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const loadingRef = useRef(false);
  const editorRef = useRef<RichTextEditorRef>(null);

  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregandoCats, setCarregandoCats] = useState(false);
  const [carregandoSubs, setCarregandoSubs] = useState(false);

  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    prioridade_id: "",
    cliente_id: "",
    departamento_id: "",
    categoria_id: "",
    subcategoria_id: "",
    atribuido_a: "",
  });

  // ── Dropdown solicitante ─────────────────────────────────────────────────
  const [solicitanteModalAberto, setSolicitanteModalAberto] = useState(false);
  const [solicitanteBusca, setSolicitanteBusca] = useState("");
  const [solicitanteNomeSelecionado, setSolicitanteNomeSelecionado] = useState("");
  const [solicitanteResultados, setSolicitanteResultados] = useState<Usuario[]>([]);
  const [buscandoSolicitante, setBuscandoSolicitante] = useState(false);
  // Clientes vinculados ao solicitante selecionado (null = sem filtro)
  const [solicitanteClientes, setSolicitanteClientes] = useState<Cliente[] | null>(null);
  const solicitanteRef = useRef<HTMLDivElement>(null);

  // ── Dropdown cliente ─────────────────────────────────────────────────────
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteNomeSelecionado, setClienteNomeSelecionado] = useState("");
  const [clienteResultados, setClienteResultados] = useState<Cliente[]>([]);
  const [clienteDropdownAberto, setClienteDropdownAberto] = useState(false);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const clienteRef = useRef<HTMLDivElement>(null);

  // ── Combobox atendente ────────────────────────────────────────────────────
  const [atendenteBusca, setAtendenteBusca] = useState("");
  const [atendenteAberto, setAtendenteAberto] = useState(false);
  const atendenteRef = useRef<HTMLDivElement>(null);

  const fecharAtendente = useCallback(() => setAtendenteAberto(false), []);
  const fecharSolicitante = useCallback(() => setSolicitanteModalAberto(false), []);

  // Click-outside handlers memoizados
  const handleAtendenteClickOutside = useCallback((e: MouseEvent) => {
    if (atendenteRef.current && !atendenteRef.current.contains(e.target as Node)) {
      fecharAtendente();
    }
  }, [fecharAtendente]);

  const handleSolicitanteClickOutside = useCallback((e: MouseEvent) => {
    if (solicitanteRef.current && !solicitanteRef.current.contains(e.target as Node)) {
      fecharSolicitante();
    }
  }, [fecharSolicitante]);

  const handleClienteClickOutside = useCallback((e: MouseEvent) => {
    if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
      setClienteDropdownAberto(false);
    }
  }, []);

  // Click-outside: atendente
  useEffect(() => {
    if (atendenteAberto) {
      document.addEventListener("mousedown", handleAtendenteClickOutside);
      return () => document.removeEventListener("mousedown", handleAtendenteClickOutside);
    }
  }, [atendenteAberto, handleAtendenteClickOutside]);

  // Click-outside: solicitante
  useEffect(() => {
    if (solicitanteModalAberto) {
      document.addEventListener("mousedown", handleSolicitanteClickOutside);
      return () => document.removeEventListener("mousedown", handleSolicitanteClickOutside);
    }
  }, [solicitanteModalAberto, handleSolicitanteClickOutside]);

  // Click-outside: cliente
  useEffect(() => {
    if (clienteDropdownAberto) {
      document.addEventListener("mousedown", handleClienteClickOutside);
      return () => document.removeEventListener("mousedown", handleClienteClickOutside);
    }
  }, [clienteDropdownAberto, handleClienteClickOutside]);

  // Busca de solicitante com debounce
  useEffect(() => {
    if (!solicitanteModalAberto) return;
    if (!solicitanteBusca) {
      setSolicitanteResultados([]);
      return;
    }

    let isMounted = true;
    const t = setTimeout(async () => {
      if (!isMounted) return;

      setBuscandoSolicitante(true);
      try {
        const res = await fetch(
          `/api/usuarios?perfil=cliente&q=${encodeURIComponent(solicitanteBusca)}&pageSize=20`,
        );

        if (!isMounted) return;

        if (res.ok) {
          const d = await res.json();
          setSolicitanteResultados(d.data ?? []);
        }
      } catch (error) {
        console.error('[NovoTicket] Erro ao buscar solicitantes:', error);
      } finally {
        if (isMounted) {
          setBuscandoSolicitante(false);
        }
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(t);
      setBuscandoSolicitante(false);
    };
  }, [solicitanteBusca, solicitanteModalAberto]);

  // Busca de cliente com debounce — só quando não há clientes vinculados ao solicitante
  useEffect(() => {
    if (solicitanteClientes !== null && solicitanteClientes.length > 0) return;
    if (!clienteBusca || clienteNomeSelecionado === clienteBusca) {
      setClienteResultados([]);
      return;
    }

    let isMounted = true;
    const t = setTimeout(async () => {
      if (!isMounted) return;

      setBuscandoCliente(true);
      try {
        const res = await fetch(
          `/api/clientes?q=${encodeURIComponent(clienteBusca)}&pageSize=15`,
        );

        if (!isMounted) return;

        if (res.ok) {
          const d = await res.json();
          setClienteResultados(d.data ?? []);
          if ((d.data ?? []).length > 0) setClienteDropdownAberto(true);
        }
      } catch (error) {
        console.error('[NovoTicket] Erro ao buscar clientes:', error);
      } finally {
        if (isMounted) {
          setBuscandoCliente(false);
        }
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(t);
      setBuscandoCliente(false);
    };
  }, [clienteBusca, clienteNomeSelecionado, solicitanteClientes]);

  function selecionarCliente(c: Cliente) {
    setForm((f) => ({ ...f, cliente_id: c.id }));
    setClienteNomeSelecionado(c.nome_razao);
    setClienteBusca(c.nome_razao);
    setClienteDropdownAberto(false);
    setClienteResultados([]);
  }

  function limparCliente() {
    setForm((f) => ({ ...f, cliente_id: "" }));
    setClienteNomeSelecionado("");
    setClienteBusca("");
    setClienteResultados([]);
    setClienteDropdownAberto(false);
  }

  async function selecionarSolicitante(u: Usuario) {
    setSolicitanteNomeSelecionado(u.nome);
    setSolicitanteModalAberto(false);
    setSolicitanteBusca("");
    setSolicitanteResultados([]);
    limparCliente();
    try {
      const res = await fetch(`/api/clientes?usuario_id=${u.id}&pageSize=20`);
      if (res.ok) {
        const d = await res.json();
        const lista: Cliente[] = d.data ?? [];
        setSolicitanteClientes(lista);
        if (lista.length === 1) {
          selecionarCliente(lista[0]);
        } else if (lista.length > 1) {
          setClienteResultados(lista);
          setClienteDropdownAberto(true);
        }
      } else {
        setSolicitanteClientes([]);
      }
    } catch {
      setSolicitanteClientes([]);
    }
  }

  function limparSolicitante() {
    setSolicitanteNomeSelecionado("");
    setSolicitanteBusca("");
    setSolicitanteResultados([]);
    setSolicitanteClientes(null);
    limparCliente();
  }

  // Memoized arrays e cálculos
  const usuariosFiltrados = useMemo(() =>
    usuarios.filter((u) =>
      u.nome.toLowerCase().includes(atendenteBusca.toLowerCase()),
    ),
    [usuarios, atendenteBusca]
  );

  const atendenteNome = useMemo(() =>
    usuarios.find((u) => u.id === form.atribuido_a)?.nome ?? null,
    [usuarios, form.atribuido_a]
  );

  const prioridadesOptions = useMemo(() =>
    prioridades.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor })),
    [prioridades]
  );

  const departamentosOptions = useMemo(() =>
    departamentos.map((d) => ({ id: d.id, nome: d.nome })),
    [departamentos]
  );

  const categoriasOptions = useMemo(() =>
    categorias.map((c) => ({ id: c.id, nome: c.nome })),
    [categorias]
  );

  const subcategoriasOptions = useMemo(() =>
    subcategorias.map((s) => ({ id: s.id, nome: s.nome })),
    [subcategorias]
  );

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    let isMounted = true;

    const carregar = async () => {
      try {
        const [resP, resDep, resU] = await Promise.all([
          fetch("/api/ticket-prioridades"),
          fetch("/api/departamentos?pageSize=100"),
          fetch("/api/usuarios?pageSize=200"),
        ]);

        if (!isMounted) return;

        if (resP.ok) {
          const prioData = await resP.json();
          setPrioridades(prioData);
        }

        if (resDep.ok) {
          const depData = await resDep.json();
          setDepartamentos(depData.data ?? depData);
        }

        if (resU.ok) {
          const usuData = await resU.json();
          setUsuarios(
            (usuData.data ?? []).filter((u: Usuario) => u.perfil !== "cliente"),
          );
        }
      } catch (error) {
        console.error('[NovoTicket] Erro ao carregar dados:', error);
      } finally {
        if (isMounted) {
          setCarregandoInicial(false);
        }
        loadingRef.current = false;
      }
    };

    carregar();

    return () => {
      isMounted = false;
      loadingRef.current = false;
    };
  }, []);

  // Cleanup geral quando componente for desmontado
  useEffect(() => {
    return () => {
      // Reset todos os states e referências
      setCarregandoInicial(false);
      setCarregandoCats(false);
      setCarregandoSubs(false);
      setSalvando(false);
      setErro("");
      setPrioridades([]);
      setDepartamentos([]);
      setCategorias([]);
      setSubcategorias([]);
      setUsuarios([]);
      setBuscandoSolicitante(false);
      setBuscandoCliente(false);
      setSolicitanteModalAberto(false);
      setAtendenteAberto(false);
      setClienteDropdownAberto(false);
      loadingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!form.departamento_id) {
      setCategorias([]);
      setSubcategorias([]);
      setForm((f) => ({ ...f, categoria_id: "", subcategoria_id: "" }));
      setCarregandoCats(false);
      return;
    }

    setCarregandoCats(true);
    let isMounted = true;

    const timer = setTimeout(async () => {
      if (!isMounted) return;

      try {
        const response = await fetch(`/api/categorias?departamento_id=${form.departamento_id}&pageSize=100`);

        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();
          setCategorias(data.data ?? data);
          setSubcategorias([]);
          setForm((f) => ({ ...f, categoria_id: "", subcategoria_id: "" }));
        }
      } catch (error) {
        console.error('[NovoTicket] Erro ao carregar categorias:', error);
      } finally {
        if (isMounted) {
          setCarregandoCats(false);
        }
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      setCarregandoCats(false);
    };
  }, [form.departamento_id]);

  useEffect(() => {
    if (!form.categoria_id) {
      setSubcategorias([]);
      setForm((f) => ({ ...f, subcategoria_id: "" }));
      setCarregandoSubs(false);
      return;
    }

    setCarregandoSubs(true);
    let isMounted = true;

    const timer = setTimeout(async () => {
      if (!isMounted) return;

      try {
        const response = await fetch(`/api/subcategorias?categoria_id=${form.categoria_id}&pageSize=100`);

        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();
          setSubcategorias(data.data ?? data);
          setForm((f) => ({ ...f, subcategoria_id: "" }));
        }
      } catch (error) {
        console.error('[NovoTicket] Erro ao carregar subcategorias:', error);
      } finally {
        if (isMounted) {
          setCarregandoSubs(false);
        }
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      setCarregandoSubs(false);
    };
  }, [form.categoria_id]);

  // Memoized handlers
  const handleFormChange = useCallback((field: string, value: any) => {
    setForm((f) => ({ ...f, [field]: value }));
  }, []);

  const salvar = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) {
      setErro("Assunto é obrigatório");
      return;
    }
    if (form.descricao.replace(/<[^>]*>/g, "").trim().length < 10) {
      setErro("Descrição deve ter pelo menos 10 caracteres");
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo,
          descricao: form.descricao,
          prioridade_id: form.prioridade_id || null,
          cliente_id: form.cliente_id || null,
          departamento_id: form.departamento_id || null,
          categoria_id: form.categoria_id || null,
          subcategoria_id: form.subcategoria_id || null,
          atribuido_a: form.atribuido_a || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao criar ticket");
        return;
      }
      toast.success(`Ticket #${data.numero} criado com sucesso!`);
      router.push(`/painel/tickets/${data.id}`);
    } finally {
      setSalvando(false);
    }
  }, [form, router]);

  // Early return para loading inicial
  if (carregandoInicial) {
    return (
      <div className="max-w-2xl flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando formulário...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/painel/tickets"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-0.5">
            NOVO TICKET
          </p>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">
            Abrir chamado
          </h1>
        </div>
      </div>

      <form
        onSubmit={salvar}
        className="space-y-5 bg-white rounded-xl border border-gray-200 p-6"
      >
        {/* Assunto */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Assunto <span className="text-red-500">*</span>
          </Label>
          <Input
            value={form.titulo}
            onChange={(e) => handleFormChange('titulo', e.target.value)}
            placeholder="Descreva brevemente o problema..."
            className="h-9"
          />
        </div>

        {/* Descrição */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Descrição <span className="text-red-500">*</span>
          </Label>
          <RichTextEditor
            ref={editorRef}
            value={form.descricao}
            onChange={(html) => handleFormChange('descricao', html)}
            placeholder="Detalhe o problema, passos para reproduzir, impacto..."
            disabled={salvando}
          />
        </div>

        {/* Solicitante */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Solicitante
          </Label>
          <div className="relative" ref={solicitanteRef}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSolicitanteModalAberto((v) => !v)}
                className="flex-1 h-9 flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <span className={solicitanteNomeSelecionado ? "text-gray-900" : "text-gray-400"}>
                  {solicitanteNomeSelecionado || "Pesquisar solicitante..."}
                </span>
                <Search size={14} className="text-gray-400 flex-shrink-0" />
              </button>
              {solicitanteNomeSelecionado && (
                <button
                  type="button"
                  onClick={limparSolicitante}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
            {solicitanteModalAberto && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
                  <Search size={13} className="text-gray-400 flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={solicitanteBusca}
                    onChange={(e) => setSolicitanteBusca(e.target.value)}
                    placeholder="Pesquisar por nome..."
                    className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                  />
                  {buscandoSolicitante && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />
                  )}
                </div>
                <ul className="max-h-48 overflow-y-auto py-1">
                  {!solicitanteBusca && (
                    <li className="px-3 py-2 text-sm text-gray-400 text-center">
                      Digite para pesquisar usuários clientes
                    </li>
                  )}
                  {solicitanteBusca && !buscandoSolicitante && solicitanteResultados.length === 0 && (
                    <li className="px-3 py-2 text-sm text-gray-400 text-center">
                      Nenhum usuário encontrado
                    </li>
                  )}
                  {solicitanteResultados.map((u) => (
                    <li
                      key={u.id}
                      onMouseDown={() => selecionarSolicitante(u)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <User size={12} className="text-blue-600" />
                      </div>
                      <span className="text-gray-800">{u.nome}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Prioridade + Cliente */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Prioridade
            </Label>
            <Select
              value={form.prioridade_id}
              onValueChange={(v) => handleFormChange('prioridade_id', v ?? "")}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {prioridadesOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: p.cor }}
                      />
                      {p.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cliente — inline search dropdown */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Cliente
            </Label>
            <div className="relative" ref={clienteRef}>
              <div className="relative">
                <Input
                  value={clienteBusca}
                  onChange={(e) => {
                    const val = e.target.value;
                    setClienteBusca(val);
                    setClienteNomeSelecionado("");
                    setForm((f) => ({ ...f, cliente_id: "" }));
                    if (solicitanteClientes !== null && solicitanteClientes.length > 0) {
                      // Filtrar localmente os clientes do solicitante
                      const filtrados = solicitanteClientes.filter((c) =>
                        c.nome_razao.toLowerCase().includes(val.toLowerCase()),
                      );
                      setClienteResultados(filtrados);
                      setClienteDropdownAberto(filtrados.length > 0);
                    } else {
                      setClienteDropdownAberto(true);
                    }
                  }}
                  onFocus={() => {
                    if (solicitanteClientes !== null && solicitanteClientes.length > 1 && !form.cliente_id) {
                      setClienteResultados(solicitanteClientes);
                      setClienteDropdownAberto(true);
                    } else if (clienteResultados.length > 0) {
                      setClienteDropdownAberto(true);
                    }
                  }}
                  placeholder={
                    solicitanteClientes !== null && solicitanteClientes.length === 0
                      ? "Nenhum cliente vinculado"
                      : solicitanteNomeSelecionado && solicitanteClientes !== null
                      ? "Clientes do solicitante..."
                      : "Pesquisar cliente..."
                  }
                  disabled={solicitanteClientes !== null && solicitanteClientes.length === 0}
                  className="h-9 pr-7 text-sm"
                />
                {form.cliente_id && (
                  <button
                    type="button"
                    onClick={limparCliente}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <XIcon size={13} />
                  </button>
                )}
                {buscandoCliente && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                )}
              </div>
              {clienteDropdownAberto && clienteResultados.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                  {clienteResultados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selecionarCliente(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                    >
                      <p className="font-medium text-gray-800">{c.nome_razao}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Atendente — combobox com pesquisa */}
        <div className="space-y-1.5" ref={atendenteRef}>
          <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Atendente
          </Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAtendenteAberto((v) => !v);
                setAtendenteBusca("");
              }}
              className="w-full h-9 flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <span className={atendenteNome ? "text-gray-900" : "text-gray-400"}>
                {atendenteNome ?? "Escolher atendente..."}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {form.atribuido_a && (
                  <span
                    role="button"
                    tabIndex={0}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setForm((f) => ({ ...f, atribuido_a: "" }));
                    }}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <XIcon size={13} />
                  </span>
                )}
                <ChevronDown size={14} className="text-gray-400" />
              </div>
            </button>

            {atendenteAberto && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
                  <Search size={13} className="text-gray-400 flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={atendenteBusca}
                    onChange={(e) => setAtendenteBusca(e.target.value)}
                    placeholder="Pesquisar..."
                    className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                  />
                </div>
                <ul className="max-h-48 overflow-y-auto py-1">
                  <li
                    onMouseDown={() => {
                      setForm((f) => ({ ...f, atribuido_a: "" }));
                      setAtendenteAberto(false);
                    }}
                    className={`flex items-center px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${
                      form.atribuido_a === "" ? "bg-gray-100" : ""
                    }`}
                  >
                    <span className="text-gray-400">Sem atendente</span>
                  </li>
                  {usuariosFiltrados.length === 0 && atendenteBusca && (
                    <li className="px-3 py-1.5 text-sm text-gray-400">
                      Nenhum resultado
                    </li>
                  )}
                  {usuariosFiltrados.map((u) => (
                    <li
                      key={u.id}
                      onMouseDown={() => {
                        setForm((f) => ({ ...f, atribuido_a: u.id }));
                        setAtendenteAberto(false);
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${
                        form.atribuido_a === u.id
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-900"
                      }`}
                    >
                      <span>{u.nome}</span>
                      {form.atribuido_a === u.id && (
                        <svg
                          className="w-3.5 h-3.5 text-blue-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Departamento */}
        {departamentos.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Departamento
            </Label>
            <Select
              value={form.departamento_id}
              onValueChange={(v) => handleFormChange('departamento_id', v ?? "")}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {departamentosOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Categoria (cascata do departamento) */}
        {form.departamento_id && (
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Categoria
            </Label>
            {carregandoCats ? (
              <div className="h-9 flex items-center px-3 rounded-md border border-input bg-background text-sm text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Carregando...
              </div>
            ) : categorias.length === 0 ? (
              <div className="h-9 flex items-center px-3 rounded-md border border-input bg-background text-sm text-gray-400">
                Nenhuma categoria disponível
              </div>
            ) : (
              <Select
                value={form.categoria_id}
                onValueChange={(v) => handleFormChange('categoria_id', v ?? "")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {categoriasOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Subcategoria (cascata da categoria) */}
        {form.categoria_id && (
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Subcategoria
            </Label>
            {carregandoSubs ? (
              <div className="h-9 flex items-center px-3 rounded-md border border-input bg-background text-sm text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Carregando...
              </div>
            ) : subcategorias.length === 0 ? (
              <div className="h-9 flex items-center px-3 rounded-md border border-input bg-background text-sm text-gray-400">
                Nenhuma subcategoria disponível
              </div>
            ) : (
              <Select
                value={form.subcategoria_id}
                onValueChange={(v) => handleFormChange('subcategoria_id', v ?? "")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {subcategoriasOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {erro && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <Link href="/painel/tickets">
            <Button type="button" variant="outline" className="h-9">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" disabled={salvando} className="h-9">
            {salvando ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1.5" />
            )}
            Abrir ticket
          </Button>
        </div>
      </form>
    </div>
  );
}
