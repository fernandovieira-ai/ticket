"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users,
  User,
  Tag,
  Layers,
  Building2,
  List,
  UserCheck,
  Clock,
  CircleDot,
  Loader,
  Hourglass,
  XCircle,
  CheckCircle2,
  Wrench,
  ClipboardList,
  BarChart2,
  PieChart,
  Settings,
  Building,
  SlidersHorizontal,
  Timer,
  MessageCircle,
  Bot,
  Activity,
  LogOut,
  LayoutDashboard,
} from "lucide-react";

interface SubItem {
  label: string;
  href: string;
  separator?: boolean;
  icon?: React.ReactNode;
}

interface MenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  items: SubItem[];
  adminOnly?: boolean;
}

const MENU: MenuItem[] = [
  {
    id: "cadastros",
    icon: <Users size={16} strokeWidth={1.5} />,
    label: "Cadastros",
    items: [
      {
        label: "Clientes",
        href: "/painel/clientes",
        icon: <Users size={13} />,
      },
      {
        label: "Usuários",
        href: "/painel/configuracoes/usuarios",
        icon: <User size={13} />,
      },
      {
        label: "Subcategorias",
        href: "/painel/configuracoes/subcategorias",
        icon: <Layers size={13} />,
      },
      {
        label: "Categorias",
        href: "/painel/configuracoes/categorias",
        icon: <Tag size={13} />,
      },
      {
        label: "Departamentos",
        href: "/painel/configuracoes/departamentos",
        icon: <Building2 size={13} />,
      },
    ],
  },
  {
    id: "tickets",
    icon: <ClipboardList size={16} strokeWidth={1.5} />,
    label: "Tickets",
    items: [
      { label: "Todos", href: "/painel/tickets", icon: <List size={13} /> },
      {
        label: "Meus tickets",
        href: "/painel/tickets?meus=1",
        icon: <UserCheck size={13} />,
      },
      {
        label: "Fila",
        href: "/painel/tickets?fila=1",
        icon: <Clock size={13} />,
      },
      { label: "Por Status", href: "", separator: true },
      {
        label: "Aberto",
        href: "/painel/tickets/status/aberto",
        icon: <CircleDot size={13} />,
      },
      {
        label: "Em Andamento",
        href: "/painel/tickets/status/em_andamento",
        icon: <Loader size={13} />,
      },
      {
        label: "Aguardando",
        href: "/painel/tickets/status/aguardando_cliente",
        icon: <Hourglass size={13} />,
      },
      {
        label: "Cancelado",
        href: "/painel/tickets/status/cancelado",
        icon: <XCircle size={13} />,
      },
      {
        label: "Finalizado",
        href: "/painel/tickets/status/finalizado",
        icon: <CheckCircle2 size={13} />,
      },
    ],
  },
  {
    id: "solicitacoes",
    icon: <Wrench size={16} strokeWidth={1.5} />,
    label: "Solicitações",
    items: [
      {
        label: "Solicitações internas",
        href: "/painel/solicitacoes",
        icon: <ClipboardList size={13} />,
      },
    ],
  },
  {
    id: "relatorios",
    icon: <BarChart2 size={16} strokeWidth={1.5} />,
    label: "Relatórios",
    items: [
      {
        label: "Visão geral",
        href: "/painel/relatorios",
        icon: <PieChart size={13} />,
      },
      {
        label: "Operadores",
        href: "/painel/relatorios/operadores",
        icon: <UserCheck size={13} />,
      },
    ],
  },
  {
    id: "whatsapp",
    icon: <MessageCircle size={16} strokeWidth={1.5} />,
    label: "WhatsApp",
    items: [
      {
        label: "Grupos",
        href: "/painel/whatsapp/grupos",
        icon: <Users size={13} />,
      },
      {
        label: "Análise IA",
        href: "/painel/whatsapp/analise-ia",
        icon: <Activity size={13} />,
      },
      {
        label: "Ranking Grupos",
        href: "/painel/whatsapp/ranking-grupos",
        icon: <BarChart2 size={13} />,
      },
      {
        label: "Base de Conhecimento",
        href: "/painel/whatsapp/base-conhecimento",
        icon: <Bot size={13} />,
      },
    ],
  },
  {
    id: "configuracoes",
    icon: <Settings size={16} strokeWidth={1.5} />,
    label: "Config.",
    adminOnly: true,
    items: [
      {
        label: "Empresa",
        href: "/painel/configuracoes/empresa",
        icon: <Building size={13} />,
      },
      {
        label: "Geral",
        href: "/painel/configuracoes/geral",
        icon: <SlidersHorizontal size={13} />,
      },
      {
        label: "SLA",
        href: "/painel/configuracoes/sla",
        icon: <Timer size={13} />,
      },
      {
        label: "WhatsApp",
        href: "/painel/configuracoes/whatsapp",
        icon: <MessageCircle size={13} />,
      },
      {
        label: "IA",
        href: "/painel/configuracoes/ia",
        icon: <Bot size={13} />,
      },
    ],
  },
];

interface SidebarProps {
  perfil: string;
  logoUrl?: string | null;
}

export function Sidebar({ perfil, logoUrl }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState<string | null>(() => {
    // Inicializar estado a partir do localStorage se disponível
    if (typeof window !== 'undefined') {
      return localStorage.getItem("sidebar_active");
    }
    return null;
  });
  const [logoError, setLogoError] = useState(false);

  const toggleMenu = useCallback((id: string) => {
    const next = activeMenu === id ? null : id;
    setActiveMenu(next);
    if (next) {
      localStorage.setItem("sidebar_active", next);
    } else {
      localStorage.removeItem("sidebar_active");
    }
  }, [activeMenu]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (error) {
      // Fallback se o fetch falhar
      window.location.href = "/login";
    }
  }, [router]);

  const clearActiveMenu = useCallback(() => {
    setActiveMenu(null);
    localStorage.removeItem("sidebar_active");
  }, []);

  const isAdmin = useMemo(() => ["admin", "supervisor"].includes(perfil), [perfil]);

  // Memoizar filtro de menu para evitar recálculos
  const filteredMenu = useMemo(() => {
    return MENU.filter(item => !item.adminOnly || isAdmin);
  }, [isAdmin]);

  // Memoizar cálculo de path ativo
  const activePathInfo = useMemo(() => {
    const currentSearch = searchParams.toString();
    const currentFull = currentSearch ? `${pathname}?${currentSearch}` : pathname;
    return { currentFull, pathname };
  }, [pathname, searchParams]);

  return (
    <div className="flex h-full">
      {/* Coluna de ícones (56px) */}
      <div
        className="h-full flex flex-col items-center py-0"
        style={{
          width: 56,
          backgroundColor: "var(--color-bg-primary)",
          borderRight: "0.5px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        {/* Logo DR */}
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            height: 52,
            width: "100%",
            borderBottom: "0.5px solid var(--color-border)",
          }}
        >
          {logoUrl && !logoError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="object-contain"
              style={{ width: 32, height: 32, borderRadius: 8 }}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div
              className="flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: "var(--color-brand)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  letterSpacing: "0.02em",
                }}
              >
                DR
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-1 w-full px-1.5 py-2">
          {/* Dashboard */}
          <Link
            href="/painel/dashboard"
            title="Dashboard"
            onClick={clearActiveMenu}
            prefetch
            className={cn(
              "sidebar-menu-btn w-full flex flex-col items-center justify-center py-2 rounded-lg",
              pathname === "/painel/dashboard" && "active",
            )}
          >
            <LayoutDashboard size={16} strokeWidth={1.5} />
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                marginTop: 2,
                lineHeight: 1,
              }}
            >
              Dashboard
            </span>
          </Link>

          {filteredMenu.map((item) => {
            const isActive = activeMenu === item.id;
            const hasActivePath = item.items.some(
              (sub) => sub.href && activePathInfo.pathname.startsWith(sub.href.split("?")[0]),
            );

            return (
              <button
                key={item.id}
                onClick={() => toggleMenu(item.id)}
                title={item.label}
                className={cn(
                  "sidebar-menu-btn w-full flex flex-col items-center justify-center py-2 rounded-lg cursor-pointer",
                  isActive && "active",
                  !isActive && hasActivePath && "has-active-path",
                )}
              >
                {item.icon}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    marginTop: 2,
                    lineHeight: 1,
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Sair"
          className="sidebar-logout-btn flex items-center justify-center rounded-lg mb-2"
          style={{ width: 36, height: 36 }}
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Painel lateral retrátil (210px) */}
      <div
        className={cn(
          "h-full overflow-hidden transition-[width] duration-200",
          activeMenu ? "w-[210px]" : "w-0",
        )}
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderRight: activeMenu ? "0.5px solid var(--color-border)" : "none",
          flexShrink: 0,
        }}
      >
        {/* Cabeçalho */}
        <div
          className="flex items-center gap-2 flex-shrink-0"
          style={{
            height: 52,
            padding: "0 16px",
            borderBottom: "0.5px solid var(--color-border)",
          }}
        >
          <div className="min-w-0">
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                whiteSpace: "nowrap",
                letterSpacing: "-0.3px",
              }}
            >
              DigitalRF Help
            </p>
            <p
              style={{
                fontSize: 10,
                color: "var(--color-text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              Sistema de Tickets
            </p>
          </div>
        </div>

        {filteredMenu.map((item) => {
          if (item.id !== activeMenu) return null;

          return (
            <div key={item.id} className="py-3">
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "0 16px",
                  marginBottom: 6,
                }}
              >
                {item.label}
              </p>
              {item.items.map((sub, i) => {
                if (sub.separator) {
                  return (
                    <p
                      key={`sep-${i}`}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        padding: "12px 16px 4px",
                      }}
                    >
                      {sub.label}
                    </p>
                  );
                }
                const isActive = sub.href && activePathInfo.currentFull === sub.href;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    prefetch
                    className={cn(
                      "sidebar-submenu-link flex items-center gap-2 transition-colors",
                      isActive && "active",
                    )}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12.5,
                      fontWeight: isActive ? 600 : 400,
                      borderRadius: 6,
                      margin: "1px 8px",
                    }}
                  >
                    <span
                      style={{
                        opacity: isActive ? 1 : 0.6,
                        flexShrink: 0,
                        color: isActive ? "var(--color-brand)" : "inherit",
                      }}
                    >
                      {sub.icon}
                    </span>
                    {sub.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
