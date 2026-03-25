"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

interface OpcaoSimples {
  id: string;
  nome: string;
}

interface EmpresaOpcao {
  id: string;
  nome_razao: string;
  documento: string | null;
}

/* Select reutilizável com chevron customizado */
function SelectCustom({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-4 pr-10 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 appearance-none focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}

export default function NovoTicketPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [departamentos, setDepartamentos] = useState<OpcaoSimples[]>([]);
  const [categorias, setCategorias] = useState<OpcaoSimples[]>([]);
  const [subcategorias, setSubcategorias] = useState<OpcaoSimples[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [carregandoCats, setCarregandoCats] = useState(false);
  const [carregandoSubs, setCarregandoSubs] = useState(false);

  const [form, setForm] = useState({
    cliente_id: "",
    departamento_id: "",
    categoria_id: "",
    subcategoria_id: "",
    titulo: "",
    descricao: "",
    notificar_email: true,
    notificar_whatsapp: true,
  });
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  /* Carrega departamentos e empresas do usuário ao montar */
  useEffect(() => {
    fetch("/api/departamentos?pageSize=100")
      .then((r) => r.json())
      .then((d) => setDepartamentos(d.data ?? d))
      .catch(() => {});

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(async (me) => {
        const r = await fetch(`/api/clientes?usuario_id=${me.sub}&pageSize=50`);
        if (!r.ok) return;
        const d = await r.json();
        const lista: EmpresaOpcao[] = d.data ?? [];
        setEmpresas(lista);
        if (lista.length === 1)
          setForm((f) => ({ ...f, cliente_id: lista[0].id }));
      })
      .catch(() => {});
  }, []);

  /* Carrega categorias quando departamento muda */
  useEffect(() => {
    if (!form.departamento_id) {
      setCategorias([]);
      setSubcategorias([]);
      setForm((f) => ({ ...f, categoria_id: "", subcategoria_id: "" }));
      return;
    }
    setCarregandoCats(true);
    fetch(
      `/api/categorias?departamento_id=${form.departamento_id}&visivel_cliente=true&pageSize=100`,
    )
      .then((r) => r.json())
      .then((d) => {
        setCategorias(d.data ?? []);
        setSubcategorias([]);
        setForm((f) => ({ ...f, categoria_id: "", subcategoria_id: "" }));
      })
      .catch(() => {})
      .finally(() => setCarregandoCats(false));
  }, [form.departamento_id]);

  /* Carrega subcategorias quando categoria muda */
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
        setSubcategorias(d.data ?? []);
        setForm((f) => ({ ...f, subcategoria_id: "" }));
      })
      .catch(() => {})
      .finally(() => setCarregandoSubs(false));
  }, [form.categoria_id]);

  function handleArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setArquivos((prev) => [...prev, ...files]);
    e.target.value = "";
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      setErro("Informe o assunto do chamado.");
      return;
    }
    if (form.descricao.trim().length < 10) {
      setErro("Descreva o problema com pelo menos 10 caracteres.");
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
          departamento_id: form.departamento_id || null,
          categoria_id: form.categoria_id || null,
          subcategoria_id: form.subcategoria_id || null,
          cliente_id: form.cliente_id || null,
          notificar_email: form.notificar_email,
          notificar_whatsapp: form.notificar_whatsapp,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao criar chamado");
        return;
      }
      toast.success(`Chamado #${data.numero} criado com sucesso!`);
      router.push(`/portal/meus-tickets/${data.id}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-full">
      {/* Cabeçalho da página */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Cadastrar Novo Chamado
        </h1>
        <button
          type="button"
          onClick={() => router.push("/portal/meus-tickets")}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>

      {/* Formulário */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-2xl mx-auto">
        <form onSubmit={enviar} className="space-y-6">
          {/* Empresa (só aparece se o usuário tiver empresas vinculadas) */}
          {empresas.length > 1 && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Empresa
              </label>
              <SelectCustom
                value={form.cliente_id}
                onChange={(v) => setForm((f) => ({ ...f, cliente_id: v }))}
                placeholder="- Selecione -"
                options={empresas.map((e) => ({
                  value: e.id,
                  label: e.documento
                    ? `${e.nome_razao} — ${e.documento}`
                    : e.nome_razao,
                }))}
              />
            </div>
          )}

          {/* Empresa única: exibe somente o nome + CNPJ */}
          {empresas.length === 1 && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Empresa
              </label>
              <div className="h-11 px-4 flex items-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
                {empresas[0].nome_razao}
                {empresas[0].documento && (
                  <span className="ml-2 text-gray-400">
                    — {empresas[0].documento}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Departamento */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Departamento
            </label>
            <SelectCustom
              value={form.departamento_id}
              onChange={(v) => setForm((f) => ({ ...f, departamento_id: v }))}
              placeholder="- Selecione -"
              options={departamentos.map((d) => ({
                value: d.id,
                label: d.nome,
              }))}
            />
          </div>

          {/* Categoria (aparece após selecionar departamento) */}
          {form.departamento_id && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Categoria
              </label>
              {carregandoCats ? (
                <div className="h-11 flex items-center px-4 rounded-lg border border-gray-200 bg-gray-50">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              ) : categorias.length === 0 ? (
                <div className="h-11 flex items-center px-4 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400">
                  Nenhuma categoria disponível
                </div>
              ) : (
                <SelectCustom
                  value={form.categoria_id}
                  onChange={(v) => setForm((f) => ({ ...f, categoria_id: v }))}
                  placeholder="- Selecione -"
                  options={categorias.map((c) => ({
                    value: c.id,
                    label: c.nome,
                  }))}
                />
              )}
            </div>
          )}

          {/* Subcategoria (aparece após selecionar categoria com subcategorias) */}
          {form.categoria_id && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Subcategoria
              </label>
              {carregandoSubs ? (
                <div className="h-11 flex items-center px-4 rounded-lg border border-gray-200 bg-gray-50">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              ) : subcategorias.length === 0 ? (
                <div className="h-11 flex items-center px-4 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400">
                  Nenhuma subcategoria disponível
                </div>
              ) : (
                <SelectCustom
                  value={form.subcategoria_id}
                  onChange={(v) => setForm((f) => ({ ...f, subcategoria_id: v }))}
                  placeholder="- Selecione -"
                  options={subcategorias.map((s) => ({
                    value: s.id,
                    label: s.nome,
                  }))}
                />
              )}
            </div>
          )}

          {/* Assunto */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Assunto
            </label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) =>
                setForm((f) => ({ ...f, titulo: e.target.value }))
              }
              placeholder="Assunto do chamado"
              maxLength={300}
              className="w-full h-11 px-4 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>

          {/* Mensagem */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Mensagem
            </label>
            <textarea
              value={form.descricao}
              onChange={(e) =>
                setForm((f) => ({ ...f, descricao: e.target.value }))
              }
              placeholder="Descreva aqui o seu chamado"
              rows={7}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>

          {/* Notificações */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="notificar_email"
                checked={form.notificar_email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notificar_email: e.target.checked }))
                }
                className="w-4 h-4 rounded border-gray-300 accent-sky-500 cursor-pointer"
              />
              <label
                htmlFor="notificar_email"
                className="text-sm text-gray-700 cursor-pointer select-none"
              >
                Receber notificações por email
              </label>
            </div>
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="notificar_whatsapp"
                checked={form.notificar_whatsapp}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    notificar_whatsapp: e.target.checked,
                  }))
                }
                className="w-4 h-4 rounded border-gray-300 accent-sky-500 cursor-pointer"
              />
              <label
                htmlFor="notificar_whatsapp"
                className="text-sm text-gray-700 cursor-pointer select-none"
              >
                Receber notificações por WhatsApp
              </label>
            </div>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          {/* Arquivos selecionados */}
          {arquivos.length > 0 && (
            <ul className="space-y-1">
              {arquivos.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
                >
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setArquivos((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="ml-3 text-gray-400 hover:text-red-500 flex-shrink-0"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Anexar arquivos */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleArquivos}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Paperclip size={15} />
              Anexar arquivos
            </button>
          </div>

          {/* Criar Chamado */}
          <button
            type="submit"
            disabled={salvando}
            className="w-full h-11 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#374151" }}
            onMouseEnter={(e) =>
              !salvando &&
              ((e.currentTarget as HTMLElement).style.backgroundColor =
                "#1f2937")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor =
                "#374151")
            }
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Criar Chamado
          </button>
        </form>
      </div>
    </div>
  );
}
