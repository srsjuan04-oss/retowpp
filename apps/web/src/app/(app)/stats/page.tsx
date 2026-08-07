import { requireRole } from "@/lib/auth/dal";
import { getConversationStats, getContactStats, getMessageStats, getRecentCampaignStats } from "@/lib/stats/queries";
import { Badge, type BadgeProps } from "@/components/ui/badge";

const CAMPAIGN_STATUS_BADGE_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "neutral",
  recipients_locked: "warning",
  queued: "warning",
  running: "brand",
  paused: "warning",
  completed: "success",
  failed: "destructive",
  cancelled: "neutral",
};

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  sent: "Enviados",
  delivered: "Entregados",
  read: "Leídos",
  failed: "Fallidos",
};

const CONSENT_LABELS: Record<string, string> = {
  subscribed: "Suscritos",
  unsubscribed: "Dados de baja",
  blocked: "Bloqueados",
  pending: "Pendientes",
};

const CONVERSATION_LABELS: Record<string, string> = {
  open: "Abiertas",
  pending: "Pendientes",
  closed: "Cerradas",
};

function StatGrid({ title, entries }: { title: string; entries: [string, number][] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entries.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function StatsPage() {
  await requireRole("admin", "supervisor");

  const [messageStats, conversationStats, contactStats, campaignStats] = await Promise.all([
    getMessageStats(),
    getConversationStats(),
    getContactStats(),
    getRecentCampaignStats(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Panel de estadísticas</h1>

      <StatGrid
        title={`Mensajes (${messageStats.inbound} entrantes · ${messageStats.outbound} salientes)`}
        entries={Object.entries(messageStats.byStatus).map(([status, value]) => [
          MESSAGE_STATUS_LABELS[status] ?? status,
          value,
        ])}
      />

      <StatGrid
        title="Conversaciones"
        entries={Object.entries(conversationStats).map(([status, value]) => [CONVERSATION_LABELS[status] ?? status, value])}
      />

      <StatGrid
        title="Contactos por consentimiento"
        entries={Object.entries(contactStats).map(([status, value]) => [CONSENT_LABELS[status] ?? status, value])}
      />

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Campañas recientes</h2>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Enviados</th>
                <th className="px-3 py-2">Entregados</th>
                <th className="px-3 py-2">Leídos</th>
                <th className="px-3 py-2">Fallidos</th>
              </tr>
            </thead>
            <tbody>
              {campaignStats.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">
                    <Badge variant={CAMPAIGN_STATUS_BADGE_VARIANTS[c.status] ?? "neutral"}>{c.status}</Badge>
                  </td>
                  <td className="px-3 py-2">{c.total}</td>
                  <td className="px-3 py-2">{c.sent}</td>
                  <td className="px-3 py-2">{c.delivered}</td>
                  <td className="px-3 py-2">{c.read}</td>
                  <td className={`px-3 py-2 ${c.failed > 0 ? "font-medium text-destructive" : ""}`}>{c.failed}</td>
                </tr>
              ))}
              {campaignStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Sin campañas todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
