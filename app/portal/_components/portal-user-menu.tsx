"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, User, Lock, ImagePlus, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface PortalUserMenuProps {
  nome: string;
}

export function PortalUserMenu({ nome }: PortalUserMenuProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/cliente/login");
  }

  const primeiroNome = nome.split(" ")[0].toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none cursor-pointer select-none">
        <span>
          Olá, <strong>{primeiroNome}</strong>
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <div className="px-3 py-2 text-xs text-muted-foreground truncate border-b border-border mb-1">
          {nome}
        </div>

        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onClick={() => router.push("/portal/minha-conta")}
        >
          <User size={15} />
          Meus dados
        </DropdownMenuItem>

        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onClick={() => router.push("/portal/minha-conta/alterar-senha")}
        >
          <Lock size={15} />
          Alterar senha
        </DropdownMenuItem>

        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onClick={() => router.push("/portal/minha-conta/avatar")}
        >
          <ImagePlus size={15} />
          Alterar meu avatar...
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut size={15} />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
