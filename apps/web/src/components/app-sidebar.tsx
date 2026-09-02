"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Building2,
  Inbox,
  LayoutGrid,
  LogOut,
  Megaphone,
  Plug,
  ScrollText,
  Tags,
  Users,
  Link2,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth/dal";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Inicio", icon: LayoutGrid },
  { href: "/inbox", label: "Bandeja", icon: Inbox },
  { href: "/contacts", label: "Contactos", icon: Users },
  { href: "/templates", label: "Plantillas", icon: ScrollText, roles: ["admin", "supervisor"] },
  { href: "/campaigns", label: "Campañas", icon: Megaphone, roles: ["admin", "supervisor"] },
  { href: "/flows", label: "Flujos", icon: Workflow, roles: ["admin", "supervisor"] },
  { href: "/complementos", label: "Complementos", icon: Plug, roles: ["admin", "supervisor"] },
  { href: "/settings/waba", label: "Conexión WABA", icon: Link2, roles: ["admin", "supervisor"] },
  { href: "/stats", label: "Estadísticas", icon: BarChart3, roles: ["admin", "supervisor"] },
  { href: "/audit-log", label: "Auditoría", icon: ScrollText, roles: ["admin", "supervisor"] },
  { href: "/settings/custom-fields", label: "Campos personalizados", icon: Tags, roles: ["admin"] },
  { href: "/settings/ai", label: "Asistente de IA", icon: Bot, roles: ["admin"] },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  role,
  isPlatformAdmin,
  displayName,
  logoutAction,
}: {
  role: Role;
  isPlatformAdmin: boolean;
  displayName: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-semibold text-brand-foreground">
          C
        </span>
        <span className="text-sm font-semibold tracking-tight">app.charlia</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {isPlatformAdmin && (
        <div className="flex flex-col gap-0.5 border-t border-sidebar-border px-3 py-3">
          <span className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
            Plataforma
          </span>
          <Link
            href="/plataforma/empresas"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              isActive(pathname, "/plataforma/empresas")
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Building2 className="size-4 shrink-0" />
            Empresas
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-sidebar-border px-3 py-3">
        <div className="truncate px-2 text-xs text-sidebar-foreground/60" title={displayName}>
          {displayName} · {role}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <LogOut className="size-4 shrink-0" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
