"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Bell, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface HeaderProps {
  nome: string;
  email: string;
  avatarUrl?: string | null;
  titulo: string;
}

export function Header({ nome, avatarUrl: avatarUrlProp }: HeaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(avatarUrlProp ?? null);
  const [uploading, setUploading] = useState(false);
  const [hoverAvatar, setHoverAvatar] = useState(false);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      window.location.href = "/login";
    }
  }, [router]);

  const initials = useMemo(() => {
    return nome
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }, [nome]);

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao enviar foto"); return; }
      setAvatarUrl(data.url);
      toast.success("Foto de perfil atualizada!");
    } finally {
      setUploading(false);
    }
  }, []);

  return (
    <header className="flex items-center justify-between w-full">
      {/* Usuário */}
      <div className="flex items-center gap-3">
        {/* Avatar clicável para trocar foto */}
        <div
          className="relative cursor-pointer flex-shrink-0"
          style={{ width: 28, height: 28 }}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={() => setHoverAvatar(true)}
          onMouseLeave={() => setHoverAvatar(false)}
          title="Clique para alterar sua foto"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <Avatar style={{ width: 28, height: 28 }}>
            {avatarUrl && <AvatarImage src={avatarUrl} alt={nome} />}
            <AvatarFallback
              style={{
                fontSize: 10,
                fontWeight: 700,
                backgroundColor: "var(--color-brand-light)",
                color: "var(--color-brand)",
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Overlay ao hover ou durante upload */}
          {(hoverAvatar || uploading) && (
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            >
              {uploading
                ? <Loader2 size={11} className="animate-spin text-white" />
                : <Camera size={11} className="text-white" />
              }
            </div>
          )}
        </div>

        <div style={{ lineHeight: 1.3 }}>
          <p style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.3 }}>
            Olá,
          </p>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3 }}>
            {nome}
          </p>
        </div>
      </div>

      {/* Ações direita */}
      <div className="flex items-center gap-2">
        <button
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: 32,
            height: 32,
            color: "var(--color-text-muted)",
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-bg-secondary)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-text-secondary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
          }}
          title="Notificações"
        >
          <Bell size={15} strokeWidth={1.5} />
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg transition-colors"
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-secondary)",
            backgroundColor: "var(--color-bg-secondary)",
            border: "0.5px solid var(--color-border)",
            padding: "5px 12px",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-border)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-bg-secondary)";
          }}
        >
          <LogOut size={13} strokeWidth={1.5} />
          Sair
        </button>
      </div>
    </header>
  );
}
