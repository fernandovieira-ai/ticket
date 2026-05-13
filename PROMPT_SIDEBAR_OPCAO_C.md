# Refatoração do Sidebar — DigitalRF Help (Opção C: Pai destacado + Trilho)

## Objetivo

Refatorar o componente do sidebar (menu lateral esquerdo) para melhorar profundidade visual entre itens pai e submenu, mantendo fundo claro e estilo profissional alinhado a SaaS B2B moderno (Linear, Notion, Vercel).

## Princípios da nova hierarquia

1. **Sidebar branca elevada sobre fundo cinza** (`#E2E8F0`) — cria sensação de "card flutuante" com box-shadow sutil
2. **Tipografia hierárquica** — pai com peso 500 e cor `#0F172A` (forte), filho com peso 400 e cor `#475569` (leve)
3. **Trilho vertical no submenu** — `border-left: 1.5px solid #CBD5E1` com indent, sem fundo diferente
4. **Estados distintos** — ativo principal usa indigo (`#EEF2FF` / `#4F46E5`); ativo dentro de submenu usa cinza claro (`#F1F5F9` / `#334155`)
5. **Brand indigo** (`#4F46E5`) para logo e item ativo principal — substitui o azul claro genérico atual

## Tarefas

### 1. Adicionar tokens CSS

Em `app/globals.css` (ou arquivo de tokens global), adicionar dentro do `:root`:

```css
:root {
  /* Sidebar - Opção C */
  --page-bg: #E2E8F0;
  --sidebar-bg: #FFFFFF;
  --sidebar-border: #E2E8F0;
  --sidebar-shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);

  /* Hierarquia de texto do menu */
  --nav-parent: #0F172A;
  --nav-child: #475569;
  --nav-muted: #94A3B8;
  --nav-section: #94A3B8;

  /* Estados */
  --nav-active-bg: #EEF2FF;
  --nav-active-text: #4F46E5;
  --nav-child-active-bg: #F1F5F9;
  --nav-child-active-text: #0F172A;
  --nav-hover-bg: #F8FAFC;

  /* Trilho do submenu */
  --nav-rail: #CBD5E1;

  /* Brand */
  --brand: #4F46E5;
  --brand-light: #EEF2FF;
}
```

E ajustar o `body` ou container principal de layout para usar `background: var(--page-bg)` no espaço atrás da sidebar (apenas o "trilho" entre sidebar e conteúdo, se aplicável — ou manter a página com fundo branco e usar o cinza só como wrapper da sidebar).

### 2. Componente Sidebar (substituir o atual)

Criar/atualizar `components/layout/Sidebar.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Ticket,
  Wrench,
  BarChart3,
  MessageCircle,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SubItem = {
  label: string;
  href: string;
};

type MenuItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  children?: SubItem[];
};

type StatusItem = {
  label: string;
  href: string;
  color: string;
};

const menu: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: Users,
    children: [
      { label: 'Clientes', href: '/cadastros/clientes' },
      { label: 'Usuários', href: '/cadastros/usuarios' },
      { label: 'Subcategorias', href: '/cadastros/subcategorias' },
      { label: 'Categorias', href: '/cadastros/categorias' },
      { label: 'Departamentos', href: '/cadastros/departamentos' },
    ],
  },
  {
    id: 'tickets',
    label: 'Tickets',
    icon: Ticket,
    children: [
      { label: 'Todos', href: '/tickets' },
      { label: 'Meus tickets', href: '/tickets/meus' },
      { label: 'Fila', href: '/tickets/fila' },
    ],
  },
  {
    id: 'solicitacoes',
    label: 'Solicitações',
    icon: Wrench,
    children: [],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: BarChart3,
    children: [],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    children: [],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
    children: [],
  },
];

const statusItems: StatusItem[] = [
  { label: 'Aberto', href: '/tickets/status/aberto', color: '#10B981' },
  { label: 'Em Andamento', href: '/tickets/status/em-andamento', color: '#F59E0B' },
  { label: 'Aguardando', href: '/tickets/status/aguardando', color: '#6366F1' },
  { label: 'Cancelado', href: '/tickets/status/cancelado', color: '#EF4444' },
  { label: 'Finalizado', href: '/tickets/status/finalizado', color: '#64748B' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    cadastros: true,
    tickets: true,
  });

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isActive = (href?: string) => href && pathname === href;
  const isChildActive = (children?: SubItem[]) =>
    children?.some((c) => pathname === c.href) ?? false;

  return (
    <aside
      className="flex flex-col w-64 h-screen bg-white border-r overflow-y-auto"
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
        boxShadow: 'var(--sidebar-shadow)',
      }}
    >
      {/* Header / Logo */}
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-semibold"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            DR
          </div>
          <div>
            <p
              className="text-[15px] font-medium leading-tight"
              style={{ color: 'var(--brand)' }}
            >
              DigitalRF Help
            </p>
            <p className="text-[11px] leading-tight" style={{ color: 'var(--nav-muted)' }}>
              Sistema de Tickets
            </p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {menu.map((item) => {
          const Icon = item.icon;
          const hasChildren = item.children && item.children.length > 0;
          const open = openGroups[item.id] ?? false;
          const active = isActive(item.href);
          const childActive = isChildActive(item.children);

          // Item simples (sem submenu)
          if (!hasChildren) {
            return (
              <Link
                key={item.id}
                href={item.href ?? '#'}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors',
                  active ? 'font-medium' : 'hover:bg-slate-50'
                )}
                style={{
                  backgroundColor: active ? 'var(--nav-active-bg)' : undefined,
                  color: active ? 'var(--nav-active-text)' : 'var(--nav-parent)',
                  fontWeight: active ? 500 : 500,
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
                className="flex items-center justify-between w-full px-2.5 py-2 rounded-md text-[13px] font-medium hover:bg-slate-50 transition-colors"
                style={{ color: 'var(--nav-parent)' }}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  {item.label}
                </span>
                {open ? (
                  <ChevronDown
                    className="w-3.5 h-3.5"
                    style={{ color: 'var(--nav-muted)' }}
                  />
                ) : (
                  <ChevronRight
                    className="w-3.5 h-3.5"
                    style={{ color: 'var(--nav-muted)' }}
                  />
                )}
              </button>

              {/* Submenu com trilho vertical */}
              {open && (
                <div
                  className="ml-3.5 pl-3.5 py-0.5 mb-1"
                  style={{ borderLeft: '1.5px solid var(--nav-rail)' }}
                >
                  {item.children!.map((child) => {
                    const childIsActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block px-2.5 py-1.5 rounded-md text-[13px] transition-colors hover:bg-slate-50"
                        style={{
                          backgroundColor: childIsActive
                            ? 'var(--nav-child-active-bg)'
                            : undefined,
                          color: childIsActive
                            ? 'var(--nav-child-active-text)'
                            : 'var(--nav-child)',
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

        {/* Seção POR STATUS */}
        <div className="pt-4 pb-1">
          <p
            className="px-2.5 mb-1 text-[10px] uppercase tracking-wider font-medium"
            style={{ color: 'var(--nav-section)' }}
          >
            Por Status
          </p>
          {statusItems.map((status) => {
            const statusActive = pathname === status.href;
            return (
              <Link
                key={status.href}
                href={status.href}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors hover:bg-slate-50"
                style={{
                  backgroundColor: statusActive ? 'var(--nav-child-active-bg)' : undefined,
                  color: statusActive ? 'var(--nav-child-active-text)' : 'var(--nav-parent)',
                  fontWeight: statusActive ? 500 : 400,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                {status.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
```

### 3. Ajustes no layout pai

No arquivo onde a sidebar é renderizada (provavelmente `app/(dashboard)/layout.tsx`), garantir que o container externo tem fundo `var(--page-bg)` para o "trilho" cinza atrás da sidebar fazer efeito:

```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-white">
        {children}
      </main>
    </div>
  );
}
```

## Checklist após aplicar

- [ ] Tokens CSS adicionados em `globals.css`
- [ ] `Sidebar.tsx` substituído pelo novo componente
- [ ] Layout pai com `--page-bg` no container que envolve sidebar + main
- [ ] Rotas dos itens (`href`) ajustadas para as rotas reais do projeto
- [ ] Lucide icons já estão instalados (`lucide-react`) — se não, `npm install lucide-react`
- [ ] Testar: pai com peso forte, filho com peso leve, trilho vertical visível à esquerda dos submenus, ativo principal indigo, ativo no submenu cinza claro
- [ ] Verificar dark mode (se existir) — os tokens estão definidos só para light, replicar em `.dark` se necessário

## Notas

- Mantive `useState` local para abrir/fechar grupos. Se quiser persistir o estado entre navegações, mover para Zustand ou cookie.
- Os itens `Solicitações`, `Relatórios`, `WhatsApp`, `Configurações` estão com `children: []` — substituir pelos submenus reais quando definidos, ou converter para item simples com `href`.
- Ícones: usei lucide-react por padrão do shadcn/ui. Se o projeto usa outra biblioteca, ajustar imports.
- A largura `w-64` (256px) é confortável; ajuste para `w-60` (240px) se quiser mais compacto como no print original.
