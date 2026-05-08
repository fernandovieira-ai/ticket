"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Bell } from "lucide-react";

interface HeaderProps {
  nome: string;
  email: string;
  avatarUrl?: string | null;
  titulo: string;
}

export function Header({ nome, avatarUrl }: HeaderProps) {
  const router = useRouter();

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (error) {
      // Fallback se o fetch falhar
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

  return (
    <header
      className="flex items-center justify-between flex-shrink-0"
      style={{
        height: 52,
        backgroundColor: "var(--color-bg-primary)",
        borderBottom: "0.5px solid var(--color-border)",
        padding: "0 24px",
      }}
    >
      {/* Usuário */}
      <div className="flex items-center gap-3">
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
        <div style={{ lineHeight: 1.3 }}>
          <p
            style={{
              fontSize: 10,
              color: "var(--color-text-muted)",
              lineHeight: 1.3,
            }}
          >
            Olá,
          </p>
          <p
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              lineHeight: 1.3,
            }}
          >
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
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "var(--color-bg-secondary)";
            (e.currentTarget as HTMLElement).style.color =
              "var(--color-text-secondary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "transparent";
            (e.currentTarget as HTMLElement).style.color =
              "var(--color-text-muted)";
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
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "var(--color-border)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "var(--color-bg-secondary)";
          }}
        >
          <LogOut size={13} strokeWidth={1.5} />
          Sair
        </button>
      </div>
    </header>
  );
}
