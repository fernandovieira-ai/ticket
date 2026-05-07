"use client";

import { useState, memo } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Building2, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Empresa } from "@/types";

interface Props {
  empresa: Empresa;
}

function GeralClientComponent({ empresa }: Props) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(empresa.logo_url ?? "");
  const [uploadando, setUploadando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao enviar imagem");
        return;
      }
      setLogoUrl(data.url);
    } finally {
      setUploadando(false);
      e.target.value = "";
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: logoUrl || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao salvar");
        return;
      }
      toast.success("Logo atualizada com sucesso!");
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  const alterado = logoUrl !== (empresa.logo_url ?? "");

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Building2 size={20} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Configurações Gerais
          </h1>
          <p className="text-sm text-gray-500">{empresa.nome}</p>
        </div>
      </div>

      {/* Logo */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-700">Logotipo</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Exibido no cabeçalho e e-mails do sistema
          </p>
        </div>

        <div className="flex items-center gap-5">
          {/* Preview */}
          <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                className="w-16 h-16 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <Building2 size={28} className="text-gray-300" />
            )}
          </div>

          {/* Ações */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer w-fit bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {uploadando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {uploadando ? "Enviando..." : "Enviar nova imagem"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                className="hidden"
                disabled={uploadando}
                onChange={handleUpload}
              />
            </label>
            <p className="text-xs text-gray-400">
              PNG, JPG, SVG ou WebP · máx 2MB
            </p>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl("")}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700"
              >
                <Trash2 size={12} />
                Remover logo
              </button>
            )}
          </div>
        </div>

        {alterado && (
          <div className="pt-2 flex justify-end">
            <Button onClick={salvar} disabled={salvando} size="sm">
              {salvando ? (
                <Loader2 size={13} className="animate-spin mr-1.5" />
              ) : (
                <Save size={13} className="mr-1.5" />
              )}
              Salvar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export const GeralClient = memo(GeralClientComponent);
