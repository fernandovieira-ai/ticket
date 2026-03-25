"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface MeData {
  nome: string;
  email: string;
  telefone: string | null;
  avatar_url: string | null;
}

const INPUT_CLASS =
  "w-full h-11 px-4 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition";

const LABEL_CLASS = "block text-sm font-medium text-slate-600 mb-1.5";

export default function MinhaConta() {
  const router = useRouter();
  const [data, setData] = useState<MeData | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: MeData) => {
        setData(d);
        setNome(d.nome ?? "");
        setTelefone(d.telefone ?? "");
      });
  }, []);

  async function handleSave() {
    if (!nome.trim() || nome.trim().length < 2) {
      toast.error("O nome deve ter ao menos 2 caracteres.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: telefone.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Erro ao salvar.");
        return;
      }
      toast.success("Dados atualizados com sucesso!");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto py-10 px-8">
      {/* Título */}
      <h1 className="text-2xl font-bold text-slate-800 text-center mb-10">
        Meus dados
      </h1>

      <div className="space-y-5">
        {/* Nome */}
        <div>
          <label htmlFor="nome" className={LABEL_CLASS}>
            Nome
          </label>
          <input
            id="nome"
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Seu nome completo"
          />
        </div>

        {/* E-mail (somente leitura) */}
        <div>
          <label htmlFor="email" className={LABEL_CLASS}>
            Email para login
          </label>
          <input
            id="email"
            type="email"
            value={data?.email ?? ""}
            disabled
            className="w-full h-11 px-4 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400 cursor-not-allowed"
          />
        </div>

        {/* Telefone */}
        <div>
          <label htmlFor="telefone" className={LABEL_CLASS}>
            Telefone
          </label>
          <input
            id="telefone"
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className={INPUT_CLASS}
            placeholder="(11) 99999-9999"
          />
        </div>
      </div>

      {/* Botões */}
      <div className="flex items-center justify-end gap-3 mt-8">
        <button
          onClick={() => router.back()}
          className="h-10 px-6 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-10 px-6 rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Salvar
        </button>
      </div>
    </div>
  );
}
