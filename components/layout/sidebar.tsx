"use client";

import { useState, useCallback, useMemo } from "react";
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
  ChevronDown,
  ChevronRight,
  FileText,
  Calendar,
  HelpCircle,
  Key,
  Monitor,
  Shield,
  Globe,
} from "lucide-react";

interface SubItem {
  label: string;
  href: string;
  separator?: boolean;
  icon?: React.ReactNode;
}

interface MenuItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  items?: SubItem[];
  href?: string;
  adminOnly?: boolean;
}

const MENU: MenuItem[] = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/painel/dashboard"
  },
  {
    id: "intranet",
    icon: Globe,
    label: "Intranet",
    adminOnly: true,
    items: [
      {
        label: "Informativos",
        href: "/painel/intranet/informativos",
        icon: <FileText size={13} />,
      },
      {
        label: "Plantão",
        href: "/painel/intranet/plantao",
        icon: <Calendar size={13} />,
      },
      {
        label: "FAQ",
        href: "/painel/intranet/faq",
        icon: <HelpCircle size={13} />,
      },
      {
        label: "Contratos",
        href: "/painel/intranet/contratos",
        icon: <Building size={13} />,
      },
      { label: "Acessos", href: "", separator: true },
      {
        label: "DTEF",
        href: "/painel/intranet/dtef",
        icon: <Key size={13} />,
      },
      {
        label: "AnyDesk",
        href: "/painel/intranet/anydesk",
        icon: <Monitor size={13} />,
      },
      {
        label: "Dados Restritos",
        href: "/painel/intranet/dados-restritos",
        icon: <Shield size={13} />,
      },
    ],
  },
  {
    id: "tickets",
    icon: ClipboardList,
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
    icon: Wrench,
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
    id: "cadastros",
    icon: Users,
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
    id: "relatorios",
    icon: BarChart2,
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
    icon: MessageCircle,
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
    icon: Settings,
    label: "Configurações",
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
  const [logoError, setLogoError] = useState(false);

  // Estado de menus expandidos, inicializado com base no path atual
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    MENU.forEach(item => {
      if (item.items) {
        const hasActivePath = item.items.some(sub => {
          if (!sub.href) return false;
          const currentSearch = searchParams.toString();
          const currentFull = currentSearch ? `${pathname}?${currentSearch}` : pathname;
          return currentFull === sub.href || pathname.startsWith(sub.href.split("?")[0]);
        });
        if (hasActivePath) {
          initial[item.id] = true;
        }
      }
    });
    return initial;
  });

  const toggleGroup = useCallback((id: string) => {
    setExpandedMenus(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (error) {
      window.location.href = "/login";
    }
  }, [router]);

  const isAdmin = useMemo(() => ["admin", "supervisor"].includes(perfil), [perfil]);

  const filteredMenu = useMemo(() => {
    return MENU.filter(item => !item.adminOnly || isAdmin);
  }, [isAdmin]);

  const isActive = useCallback((href?: string) => {
    if (!href) return false;
    const currentSearch = searchParams.toString();
    const currentFull = currentSearch ? `${pathname}?${currentSearch}` : pathname;
    return currentFull === href;
  }, [pathname, searchParams]);

  const isChildActive = useCallback((children?: SubItem[]) => {
    return children?.some((c) => isActive(c.href)) ?? false;
  }, [isActive]);

  return (
    <aside
      className="flex flex-col w-64 h-screen overflow-y-auto"
      style={{
        backgroundImage: "var(--sidebar-bg-gradient)",
        boxShadow: "var(--sidebar-shadow)",
      }}
    >
      {/* Header / Logo */}
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <div className="flex items-center gap-2">
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
              className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              DR
            </div>
          )}
          <div>
            <p
              className="text-[15px] font-medium leading-tight"
              style={{ color: "var(--nav-parent)" }}
            >
              DigitalRF Help
            </p>
            <p className="text-[11px] leading-tight" style={{ color: "var(--nav-muted)" }}>
              Sistema de Tickets
            </p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {filteredMenu.map((item) => {
          const Icon = item.icon;
          const hasChildren = item.items && item.items.length > 0;
          const expanded = expandedMenus[item.id] ?? false;
          const active = isActive(item.href);
          const childActive = isChildActive(item.items);

          // Item simples (sem submenu)
          if (!hasChildren) {
            return (
              <Link
                key={item.id}
                href={item.href ?? "#"}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors",
                  !active && "nav-item-hover"
                )}
                style={{
                  backgroundColor: active ? "var(--nav-active-bg)" : undefined,
                  color: active ? "var(--nav-active-text)" : "var(--nav-parent)",
                  fontWeight: 600,
                }}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          }

          // Item com submenu
          return (
            <div key={item.id}>
              <button
                onClick={() => toggleGroup(item.id)}
                className={cn(
                  "flex items-center justify-between w-full px-2.5 py-2 rounded-md text-[13px] transition-colors",
                  !childActive && "nav-item-hover"
                )}
                style={{
                  color: "var(--nav-parent)",
                  fontWeight: 600,
                }}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  {item.label}
                </span>
                {expanded ? (
                  <ChevronDown
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--nav-muted)" }}
                  />
                ) : (
                  <ChevronRight
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--nav-muted)" }}
                  />
                )}
              </button>

              {/* Submenu com trilho vertical */}
              {expanded && (
                <div
                  className="ml-3.5 pl-3.5 py-0.5 mb-1"
                  style={{ borderLeft: "1.5px solid var(--nav-rail)" }}
                >
                  {item.items!.map((child, i) => {
                    if (child.separator) {
                      return (
                        <div
                          key={`sep-${i}`}
                          className="px-2.5 mb-1 text-[10px] uppercase tracking-wider font-medium mt-3"
                          style={{ color: "var(--nav-section)" }}
                        >
                          {child.label}
                        </div>
                      );
                    }

                    if (!child.href) return null;

                    const childIsActive = isActive(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                          !childIsActive && "nav-item-hover"
                        )}
                        style={{
                          backgroundColor: childIsActive
                            ? "var(--nav-child-active-bg)"
                            : undefined,
                          color: childIsActive
                            ? "var(--nav-child-active-text)"
                            : "var(--nav-child)",
                          fontWeight: childIsActive ? 500 : 400,
                        }}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Rodapé — logout */}
      <div style={{ borderTop: "1px solid var(--sidebar-border)", padding: "12px 8px" }}>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium w-full nav-item-hover transition-colors"
          style={{ color: "var(--nav-parent)" }}
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}