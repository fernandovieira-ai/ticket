"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const INPUT_CLASS =
  "w-full h-11 px-4 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition";

const LABEL_CLASS = "block text-sm font-medium text-slate-600 mb-1.5";

export default function AlterarSenha() {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!senhaAtual || !novaSenha || !confirmacao) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (novaSenha.length < 6) {
      toast.error("A nova senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmacao) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senha_atual: senhaAtual,
          nova_senha: novaSenha,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Erro ao alterar a senha.");
        return;
      }
      toast.success("Senha alterada com sucesso!");
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto py-10 px-8">
      <h1 className="text-2xl font-bold text-slate-800 text-center mb-10">
        Alterar senha
      </h1>

      <div className="space-y-5">
        <div>
          <label htmlFor="senha-atual" className={LABEL_CLASS}>
            Senha atual
          </label>
          <input
            id="senha-atual"
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="nova-senha" className={LABEL_CLASS}>
            Nova senha
          </label>
          <input
            id="nova-senha"
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="confirmar-senha" className={LABEL_CLASS}>
            Confirmar nova senha
          </label>
          <input
            id="confirmar-senha"
            type="password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={INPUT_CLASS}
          />
        </div>
      </div>

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
