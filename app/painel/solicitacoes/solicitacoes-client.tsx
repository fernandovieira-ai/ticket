"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  Loader2,
  Plus,
  ChevronRight,
  X,
  FileText,
  Wrench,
  Headphones,
  LayoutTemplate,
  ClipboardList,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RichTextEditor,
  type RichTextEditorRef,
} from "@/components/ui/rich-text-editor";
import { toast } from "sonner";

interface SolicitacaoTipo {
  id: string;
  codigo: string;
  nome: string;
  icone: string | null;
  cor: string;
}

interface SolicitacaoRow {
  id: string;
  titulo: string;
  status: string;
  tipo_nome: string;
  tipo_icone: string | null;
  tipo_cor: string;
  prioridade_nome: string | null;
  prioridade_cor: string | null;
  solicitante_nome: string;
  responsavel_nome: string | null;
  departamento_nome: string | null;
  categoria_nome: string | null;
  subcategoria_nome: string | null;
  prazo: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface Departamento { id: string; nome: string; }
interface Usuario { id: string; nome: string; perfil: string; }
interface Prioridade { id: string; nome: string; cor: string; }
interface Categoria { id: string; nome: string; }
interface Subcategoria { id: string; nome: string; }

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em Andamento",
  aguardando: "Aguardando",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  aberta: "#3B82F6",
  em_andamento: "#F59E0B",
  aguardando: "#8B5CF6",
  concluida: "#10B981",
  cancelada: "#6B7280",
};

function TipoIcone({ icone, size = 11 }: { icone: string | null; size?: number }) {
  const props = { size, className: "flex-shrink-0" };
  switch (icone) {
    case "file-text":    return <FileText {...props} />;
    case "wrench":       return <Wrench {...props} />;
    case "headphones":   return <Headphones {...props} />;
    case "layout":       return <LayoutTemplate {...props} />;
    default:             return <ClipboardList {...props} />;
  }
}

function tempoAberto(data: string): string {
  const mins = Math.floor((Date.now() - new Date(data).getTime()) / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function SolicitacoesClient() {
  const router = useRouter();

  const [rows, setRows] = useState<SolicitacaoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");

  const [tipos, setTipos] = useState<SolicitacaoTipo[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [carregandoCats, setCarregandoCats] = useState(false);
  const [carregandoSubs, setCarregandoSubs] = useState(false);

  // Painel lateral criar (igual ao tickets)
  const [painelAberto, setPainelAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const editorRef = useRef<RichTextEditorRef>(null);
  const [form, setForm] = useState({
    tipo_id: "",
    titulo: "",
    mensagem: "",
    prioridade_id: "",
    departamento_dest: "",
    responsavel_id: "",
    prazo: "",
    categoria_id: "",
    subcategoria_id: "",
  });

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (busca) params.set("q", busca);
      if (statusFiltro) params.set("status", statusFiltro);
      if (tipoFiltro) params.set("tipo_id", tipoFiltro);
      const res = await fetch(`/api/solicitacoes?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Erro ao carregar solicitações");
    } finally {
      setLoading(false);
    }
  }, [page, busca, statusFiltro, tipoFiltro]);

  useEffect(() => {
    Promise.all([
      fetch("/api/solicitacao-tipos").then((r) => r.json()),
      fetch("/api/departamentos?pageSize=50").then((r) => r.json()),
      fetch("/api/usuarios?pageSize=50").then((r) => r.json()),
      fetch("/api/ticket-prioridades").then((r) => r.json()),
    ]).then(([t, d, u, p]) => {
      setTipos(Array.isArray(t) ? t : []);
      setDepartamentos(Array.isArray(d) ? d : (d.data ?? []));
      setUsuarios(Array.isArray(u) ? u : (u.data ?? []));
      setPrioridades(Array.isArray(p) ? p : []);
    }).catch(() => {});
  }, []);

  useEffect(() => { setPage(1); }, [busca, statusFiltro, tipoFiltro]);
  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Carregar categorias quando departamento for selecionado (igual aos tickets)
  useEffect(() => {
    if (!form.departamento_dest) {
      setCategorias([]);
      setSubcategorias([]);
      setForm((f) => ({ ...f, categoria_id: "", subcategoria_id: "" }));
      return;
    }
    setCarregandoCats(true);
    fetch(`/api/categorias?departamento_id=${form.departamento_dest}&pageSize=100`)
      .then((r) => r.json())
      .then((d) => {
        setCategorias(d.data ?? d);
        setSubcategorias([]);
        setForm((f) => ({ ...f, categoria_id: "", subcategoria_id: "" }));
      })
      .catch(() => {})
      .finally(() => setCarregandoCats(false));
  }, [form.departamento_dest]);

  // Carregar subcategorias quando categoria for selecionada (igual aos tickets)
  useEffect(() => {
    if (!form.categoria_id) {
      setSubcategorias([]);
      setForm((f) => ({ ...f, subcategoria_id: "" }));
      return;
    }
    setCarregandoSubs(true);
    fetch(`/api/subcategorias?categoria_id=${form.categoria_id}&pageSize=100`)
      .then((r) => r.json())
      .then((d) => {
        setSubcategorias(d.data ?? d);
        setForm((f) => ({ ...f, subcategoria_id: "" }));
      })
      .catch(() => {})
      .finally(() => setCarregandoSubs(false));
  }, [form.categoria_id]);

  function resetForm() {
    setForm({
      tipo_id: "",
      titulo: "",
      mensagem: "",
      prioridade_id: "",
      departamento_dest: "",
      responsavel_id: "",
      prazo: "",
      categoria_id: "",
      subcategoria_id: "",
    });
    setErro("");
    editorRef.current?.clear();
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    const textoLimpo = form.mensagem.replace(/<[^>]*>/g, "").trim();
    if (!form.tipo_id) { setErro("Selecione o tipo da solicitação"); return; }
    if (!form.titulo.trim()) { setErro("Título é obrigatório"); return; }
    setSalvando(true);
    setErro("");
    try {
      const body: Record<string, unknown> = {
        tipo_id: form.tipo_id,
        titulo: form.titulo.trim(),
        descricao: textoLimpo ? form.mensagem : undefined,
        prioridade_id: form.prioridade_id || undefined,
        departamento_dest: form.departamento_dest || undefined,
        responsavel_id: form.responsavel_id || undefined,
        prazo: form.prazo || undefined,
        categoria_id: form.categoria_id || undefined,
        subcategoria_id: form.subcategoria_id || undefined,
      };
      const res = await fetch("/api/solicitacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erro ao criar");
      }
      const nova = await res.json();
      toast.success("Solicitação criada");
      setPainelAberto(false);
      resetForm();
      router.push(`/painel/solicitacoes/${nova.id}`);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro ao criar solicitação");
    } finally {
      setSalvando(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Coluna principal ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap gap-y-2">
          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            className="h-8 text-xs border border-gray-200 rounded-md px-2.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="h-8 text-xs border border-gray-200 rounded-md px-2.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os tipos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>

          <div className="ml-auto">
            <button
              onClick={() => { resetForm(); setPainelAberto(true); }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 transition-colors"
            >
              <Plus size={13} />
              Nova Solicitação
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <ClipboardList size={36} className="text-gray-200" />
              <p className="text-sm text-gray-400">Nenhuma solicitação encontrada</p>
              <button
                onClick={() => { resetForm(); setPainelAberto(true); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-md px-3 py-1.5 hover:bg-blue-50 transition-colors"
              >
                <Plus size={12} /> Criar primeira solicitação
              </button>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  {["Título", "Tipo", "Status", "Prioridade", "Solicitante", "Responsável", "Departamento", "Categoria", "Subcategoria", "Prazo", "Criado", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rows.map((row) => {
                  const prazoVencido = row.prazo && new Date(row.prazo) < new Date() && !["concluida", "cancelada"].includes(row.status);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/painel/solicitacoes/${row.id}`)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 max-w-[260px]">
                        <span className="font-medium text-gray-900 line-clamp-1">{row.titulo}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
                          style={{ color: row.tipo_cor, borderColor: row.tipo_cor + "55", backgroundColor: row.tipo_cor + "15" }}
                        >
                          <TipoIcone icone={row.tipo_icone} />
                          {row.tipo_nome}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full border"
                          style={{
                            color: STATUS_COLORS[row.status] ?? "#6B7280",
                            borderColor: (STATUS_COLORS[row.status] ?? "#6B7280") + "55",
                            backgroundColor: (STATUS_COLORS[row.status] ?? "#6B7280") + "15",
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[row.status] ?? "#6B7280" }} />
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.prioridade_nome ? (
                          <span
                            className="inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full border"
                            style={{ color: row.prioridade_cor ?? "#6B7280", borderColor: (row.prioridade_cor ?? "#6B7280") + "55", backgroundColor: (row.prioridade_cor ?? "#6B7280") + "15" }}
                          >
                            {row.prioridade_nome}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.solicitante_nome}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {row.responsavel_nome ?? <span className="text-gray-300">Não atribuído</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {row.departamento_nome ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {row.categoria_nome ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {row.subcategoria_nome ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.prazo ? (
                          <span className={`font-medium ${prazoVencido ? "text-red-600" : "text-gray-600"}`}>
                            {format(new Date(row.prazo), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-400">{tempoAberto(row.criado_em)}</td>
                      <td className="px-4 py-3">
                        <ChevronRight size={14} className="text-gray-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-500">
            <span>{total} solicitaç{total === 1 ? "ão" : "ões"}</span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors">←</button>
              <span className="px-2">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors">→</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Painel lateral — Nova Solicitação ── */}
      {painelAberto && (
        <div className="w-[420px] border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-hidden">
          {/* Header painel */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-900">Nova Solicitação</h2>
            <button onClick={() => setPainelAberto(false)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleCriar} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {erro && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>
            )}

            {/* Tipo */}
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1.5 block">
                Tipo <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {tipos.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tipo_id: t.id }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left ${
                      form.tipo_id === t.id
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span style={{ color: t.cor }}>
                      <TipoIcone icone={t.icone} size={13} />
                    </span>
                    {t.nome}
                  </button>
                ))}
              </div>
            </div>

            {/* Título */}
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1.5 block">
                Título <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Descreva brevemente a solicitação"
                className="text-xs h-9"
                maxLength={200}
              />
            </div>

            {/* Descrição */}
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Descrição</Label>
              <RichTextEditor
                ref={editorRef}
                value={form.mensagem}
                onChange={(v) => setForm((f) => ({ ...f, mensagem: v }))}
                placeholder="Detalhe a solicitação..."
                disabled={salvando}
              />
            </div>

            {/* Prioridade + Prazo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Prioridade</Label>
                <select
                  value={form.prioridade_id}
                  onChange={(e) => setForm((f) => ({ ...f, prioridade_id: e.target.value }))}
                  className="w-full h-9 text-xs border border-gray-200 rounded-md px-2.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Normal</option>
                  {prioridades.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Prazo</Label>
                <input
                  type="date"
                  value={form.prazo}
                  onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))}
                  className="w-full h-9 text-xs border border-gray-200 rounded-md px-2.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Departamento destino */}
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Departamento destino</Label>
              <select
                value={form.departamento_dest}
                onChange={(e) => setForm((f) => ({ ...f, departamento_dest: e.target.value }))}
                className="w-full h-9 text-xs border border-gray-200 rounded-md px-2.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Nenhum</option>
                {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>

            {/* Categoria (cascata do departamento) */}
            {form.departamento_dest && (
              <div>
                <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Categoria</Label>
                {carregandoCats ? (
                  <div className="h-9 flex items-center px-2.5 rounded-md border border-gray-200 bg-white text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Carregando...
                  </div>
                ) : categorias.length === 0 ? (
                  <div className="h-9 flex items-center px-2.5 rounded-md border border-gray-200 bg-white text-xs text-gray-400">
                    Nenhuma categoria disponível
                  </div>
                ) : (
                  <select
                    value={form.categoria_id}
                    onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}
                    className="w-full h-9 text-xs border border-gray-200 rounded-md px-2.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione...</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Subcategoria (cascata da categoria) */}
            {form.categoria_id && (
              <div>
                <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Subcategoria</Label>
                {carregandoSubs ? (
                  <div className="h-9 flex items-center px-2.5 rounded-md border border-gray-200 bg-white text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Carregando...
                  </div>
                ) : subcategorias.length === 0 ? (
                  <div className="h-9 flex items-center px-2.5 rounded-md border border-gray-200 bg-white text-xs text-gray-400">
                    Nenhuma subcategoria disponível
                  </div>
                ) : (
                  <select
                    value={form.subcategoria_id}
                    onChange={(e) => setForm((f) => ({ ...f, subcategoria_id: e.target.value }))}
                    className="w-full h-9 text-xs border border-gray-200 rounded-md px-2.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione...</option>
                    {subcategorias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Responsável */}
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Responsável</Label>
              <select
                value={form.responsavel_id}
                onChange={(e) => setForm((f) => ({ ...f, responsavel_id: e.target.value }))}
                className="w-full h-9 text-xs border border-gray-200 rounded-md px-2.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Não atribuído</option>
                {usuarios.filter((u) => u.perfil !== "cliente").map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 flex-shrink-0">
            <span className="text-xs text-gray-400">Ctrl+Enter para salvar</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPainelAberto(false)} className="text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 rounded-md px-3 py-1.5 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleCriar}
                disabled={salvando || !form.tipo_id || !form.titulo.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {salvando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Criar Solicitação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
