import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/dal";
import { listHotmartWebhooks } from "@/lib/complementos/hotmart-queries";
import { listApprovedTemplates } from "@/lib/templates/queries";
import { listActivePhoneNumbers } from "@/lib/campaigns/queries";
import { Badge } from "@/components/ui/badge";
import { CreateHotmartWebhookForm } from "./create-hotmart-webhook-form";
import { HotmartWebhookRowActions } from "./hotmart-webhook-row-actions";

const EVENT_LABELS: Record<string, string> = {
  PURCHASE_APPROVED: "Compra aprobada",
  PURCHASE_CANCELED: "Compra cancelada/rechazada",
  PURCHASE_OUT_OF_SHOPPING_CART: "Carrito abandonado",
};

export default async function HotmartComplementoPage() {
  const session = await requireRole("admin", "supervisor");
  const [webhooks, templates, phoneNumbers, headersList] = await Promise.all([
    listHotmartWebhooks(),
    listApprovedTemplates(),
    listActivePhoneNumbers(),
    headers(),
  ]);

  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/complementos" className="text-sm text-muted-foreground hover:underline">
            ← Complementos
          </Link>
          <h1 className="text-xl font-semibold">Hotmart</h1>
          <p className="text-sm text-muted-foreground">
            Cuando llega un evento de Hotmart, se manda automáticamente la plantilla de WhatsApp elegida al comprador.
          </p>
        </div>
        <Link href="/complementos/hotmart/historial" className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
          Ver historial
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Evento</th>
              <th className="px-3 py-2">Plantilla</th>
              <th className="px-3 py-2">Enviar desde</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Webhook</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w) => (
              <tr key={w.id} className="border-t hover:bg-accent/50">
                <td className="px-3 py-2 font-medium">{w.name}</td>
                <td className="px-3 py-2">{EVENT_LABELS[w.event] ?? w.event}</td>
                <td className="px-3 py-2">{w.templateName}</td>
                <td className="px-3 py-2">{w.phoneNumberLabel}</td>
                <td className="px-3 py-2">
                  <Badge variant={w.isActive ? "brand" : "neutral"}>{w.isActive ? "activo" : "inactivo"}</Badge>
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                  {origin}/api/webhooks/hotmart/{w.id}
                </td>
                <td className="px-3 py-2">
                  {session.role === "admin" && (
                    <HotmartWebhookRowActions
                      webhookId={w.id}
                      webhookUrl={`${origin}/api/webhooks/hotmart/${w.id}`}
                      isActive={w.isActive}
                    />
                  )}
                </td>
              </tr>
            ))}
            {webhooks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Sin webhooks todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {session.role === "admin" && (
        <div className="max-w-2xl">
          <CreateHotmartWebhookForm templates={templates} phoneNumbers={phoneNumbers} />
        </div>
      )}
    </div>
  );
}
