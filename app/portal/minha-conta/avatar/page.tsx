"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Upload, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AlterarAvatar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setCurrentAvatar(d.avatar_url ?? null));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleSave() {
    if (!file) {
      toast.error("Selecione uma imagem primeiro.");
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Erro ao enviar imagem.");
        return;
      }
      toast.success("Avatar atualizado com sucesso!");
      setCurrentAvatar(json.url);
      setFile(null);
      setPreview(null);
    } finally {
      setSaving(false);
    }
  }

  const avatarSrc = preview ?? currentAvatar;

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        <ArrowLeft size={15} />
        Voltar
      </button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alterar meu avatar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {/* Preview */}
          <div
            onClick={() => inputRef.current?.click()}
            className="relative w-28 h-28 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden hover:border-blue-400 transition-colors"
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <User size={40} className="text-gray-300" />
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-full">
              <Upload size={20} className="text-white" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Clique na imagem para selecionar um arquivo.
            <br />
            Formatos: PNG, JPG, WebP — máx. 2MB.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button
            onClick={handleSave}
            disabled={saving || !file}
            className="w-full gap-2"
          >
            <Upload size={15} />
            {saving ? "Enviando..." : "Salvar avatar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
