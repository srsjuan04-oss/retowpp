import { requireRole } from "@/lib/auth/dal";
import { listAllTemplates, type SyncedTemplate } from "@/lib/templates/queries";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SyncTemplatesButton } from "./sync-button";

const STATUS_BADGE_VARIANTS: Record<string, BadgeProps["variant"]> = {
  approved: "success",
  pending: "warning",
  rejected: "destructive",
  paused: "warning",
  disabled: "neutral",
};

function groupByWaba(templates: SyncedTemplate[]): { wabaAccountId: string; wabaBusinessName: string; templates: SyncedTemplate[] }[] {
  const groups = new Map<string, { wabaAccountId: string; wabaBusinessName: string; templates: SyncedTemplate[] }>();
  for (const t of templates) {
    const group = groups.get(t.wabaAccountId);
    if (group) group.templates.push(t);
    else groups.set(t.wabaAccountId, { wabaAccountId: t.wabaAccountId, wabaBusinessName: t.wabaBusinessName, templates: [t] });
  }
  return [...groups.values()].sort((a, b) => a.wabaBusinessName.localeCompare(b.wabaBusinessName));
}

export default async function TemplatesPage() {
  await requireRole("admin", "supervisor");
  const templates = await listAllTemplates();
  const groups = groupByWaba(templates);

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Plantillas</h1>
        <SyncTemplatesButton />
      </header>

      <p className="text-sm text-muted-foreground">
        Las plantillas se crean directamente en Meta Business Manager. Esta página solo refleja las que ya existen ahí.
      </p>

      {groups.map((group) => (
        <section key={group.wabaAccountId} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{group.wabaBusinessName}</h2>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Idioma</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Última sincronización</th>
                </tr>
              </thead>
              <tbody>
                {group.templates.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.language}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_BADGE_VARIANTS[t.status] ?? "neutral"}>{t.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(t.lastSyncedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {groups.length === 0 && <p className="text-sm text-muted-foreground">Sin plantillas sincronizadas todavía.</p>}
    </div>
  );
}
