import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getCampaign, getCampaignRecipientStats, listCampaignRecipients, previewAudience } from "@/lib/campaigns/queries";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { CampaignActions } from "./campaign-actions";

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

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  recipients_locked: "Destinatarios confirmados",
  queued: "En cola",
  running: "Enviando",
  paused: "Pausada",
  completed: "Completada",
  failed: "Fallida",
  cancelled: "Cancelada",
};

const RECIPIENT_STATUS_BADGE_VARIANTS: Record<string, BadgeProps["variant"]> = {
  pending: "neutral",
  queued: "warning",
  sent: "brand",
  delivered: "success",
  read: "success",
  failed: "destructive",
  skipped: "neutral",
};

const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  queued: "En cola",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "Fallido",
  skipped: "Omitido",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  await requireRole("admin", "supervisor");
  const { campaignId } = await params;

  const campaign = await getCampaign(campaignId);
  if (!campaign) notFound();

  const [stats, audiencePreview, recipients] = await Promise.all([
    getCampaignRecipientStats(campaignId),
    campaign.status === "draft" ? previewAudience(campaign.audienceFilter) : Promise.resolve([]),
    campaign.status === "draft" ? Promise.resolve([]) : listCampaignRecipients(campaignId),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{campaign.name}</h1>
        <Badge variant={STATUS_BADGE_VARIANTS[campaign.status] ?? "neutral"}>
          {STATUS_LABELS[campaign.status] ?? campaign.status}
        </Badge>
      </header>

      {campaign.status === "draft" && (
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Vista previa de destinatarios</h2>
          <p className="text-sm text-muted-foreground">
            {audiencePreview.length} contactos suscritos cumplen el filtro en este momento.
          </p>
          <p className="text-xs text-muted-foreground">
            Este paso no bloquea a nadie: solo fija la lista de destinatarios antes de enviar, para que no cambie a
            mitad del envío. Es obligatorio para poder continuar.
          </p>
          <CampaignActions campaignId={campaignId} status={campaign.status} />
        </section>
      )}

      {campaign.status !== "draft" && (
        <section className="grid grid-cols-4 gap-3 sm:grid-cols-7">
          {(
            [
              ["Pendientes", stats.pending],
              ["Encolados", stats.queued],
              ["Enviados", stats.sent],
              ["Entregados", stats.delivered],
              ["Leídos", stats.read],
              ["Fallidos", stats.failed],
              ["Omitidos", stats.skipped],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3 text-center">
              <p className={`text-2xl font-semibold ${label === "Fallidos" && value > 0 ? "text-destructive" : ""}`}>
                {value}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </section>
      )}

      {campaign.status === "recipients_locked" && (
        <section className="rounded-lg border p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            {stats.total} destinatarios confirmados. Al iniciar, el envío ocurre en el worker por lotes, respetando
            límites de tasa.
          </p>
          <CampaignActions campaignId={campaignId} status={campaign.status} />
        </section>
      )}

      {campaign.status !== "draft" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Destinatarios</h2>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Número</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Detalle</th>
                  <th className="px-3 py-2">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{r.phoneNumberSnapshot}</td>
                    <td className="px-3 py-2">
                      <Badge variant={RECIPIENT_STATUS_BADGE_VARIANTS[r.status] ?? "neutral"}>
                        {RECIPIENT_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.status === "failed" && (r.error?.message ?? "Sin detalle del error.")}
                      {r.status === "skipped" && (r.skipReason ?? "Omitido.")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(r.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {recipients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Sin destinatarios todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
