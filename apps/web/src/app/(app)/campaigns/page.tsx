import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { listCampaigns } from "@/lib/campaigns/queries";
import { Badge, type BadgeProps } from "@/components/ui/badge";

const STATUS_BADGE_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "neutral",
  recipients_locked: "warning",
  queued: "warning",
  running: "brand",
  paused: "warning",
  completed: "success",
  failed: "destructive",
  cancelled: "neutral",
};

export default async function CampaignsPage() {
  await requireRole("admin", "supervisor");
  const campaigns = await listCampaigns();

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campañas</h1>
        <Link href="/campaigns/new" className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
          Nueva campaña
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Creada</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t hover:bg-accent/50">
                <td className="px-3 py-2">
                  <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={STATUS_BADGE_VARIANTS[c.status] ?? "neutral"}>{c.status}</Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  Sin campañas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
