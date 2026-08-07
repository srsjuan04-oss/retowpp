import Link from "next/link";
import { Inbox, Megaphone, Users } from "lucide-react";
import { verifySession } from "@/lib/auth/dal";
import { Badge } from "@/components/ui/badge";

const QUICK_LINKS = [
  { href: "/inbox", label: "Bandeja de conversaciones", description: "Responde a tus contactos", icon: Inbox },
  { href: "/contacts", label: "Contactos", description: "Gestiona tu audiencia", icon: Users },
  {
    href: "/campaigns",
    label: "Campañas",
    description: "Envía plantillas a tus contactos",
    icon: Megaphone,
    roles: ["admin", "supervisor"],
  },
] as const;

export default async function DashboardPage() {
  const session = await verifySession();
  const links = QUICK_LINKS.filter((link) => !("roles" in link) || link.roles.includes(session.role as never));

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hola, {session.fullName ?? session.email?.split("@")[0]}
          </h1>
          <Badge variant="brand">{session.role}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Elige por dónde quieres empezar.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex flex-col gap-3 rounded-lg border p-5 transition-colors hover:border-brand/40 hover:bg-brand/5"
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-brand/10 text-brand">
              <link.icon className="size-5" />
            </span>
            <div>
              <p className="font-medium">{link.label}</p>
              <p className="text-sm text-muted-foreground">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
