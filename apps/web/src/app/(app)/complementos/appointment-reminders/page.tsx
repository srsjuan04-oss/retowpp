import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/dal";
import { listAppointmentReminderWebhooks, listReminderSenderOptions } from "@/lib/complementos/appointment-reminder-queries";
import { Badge } from "@/components/ui/badge";
import { AppointmentReminderRowActions } from "./row-actions";
import { CreateAppointmentReminderForm } from "./create-form";

export default async function AppointmentRemindersComplementoPage() {
  await requireRole("admin", "supervisor");
  const [webhooks, { phoneNumbers, templates }, headersList] = await Promise.all([
    listAppointmentReminderWebhooks(),
    listReminderSenderOptions(),
    headers(),
  ]);

  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <Link href="/complementos" className="text-sm text-muted-foreground hover:underline">
          ← Complementos
        </Link>
        <h1 className="text-xl font-semibold">Recordatorios de cita (salon-pro)</h1>
        <p className="text-sm text-muted-foreground">
          Cuando salon-pro dispara un recordatorio, llama a esta URL con los datos de la cita (nombre, servicio,
          barbero, hora) y se envía la plantilla aprobada de Meta que elijas abajo. Pega esta URL en salon-pro →
          Configuración → WhatsApp, en el recordatorio correspondiente.
        </p>
      </header>

      <CreateAppointmentReminderForm phoneNumbers={phoneNumbers} templates={templates} />

      <div className="flex flex-col gap-4">
        {webhooks.map((w) => {
          const webhookUrl = `${origin}/api/webhooks/appointment-reminder/${w.id}`;
          return (
            <div key={w.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Enviar desde: {phoneNumbers.find((p) => p.id === w.phoneNumberId)?.label ?? `${w.phoneNumberLabel} (cuenta inactiva)`} · Plantilla: {w.templateName}
                  </p>
                </div>
                <Badge variant={w.isActive ? "brand" : "neutral"}>{w.isActive ? "activo" : "inactivo"}</Badge>
              </div>

              <div className="mt-3 rounded-md bg-muted p-2">
                <p className="select-all break-all font-mono text-xs">{webhookUrl}</p>
              </div>

              <div className="mt-3">
                <AppointmentReminderRowActions
                  webhookId={w.id}
                  webhookUrl={webhookUrl}
                  isActive={w.isActive}
                  phoneNumberId={w.phoneNumberId}
                  templateId={w.templateId}
                  phoneNumbers={phoneNumbers}
                  templates={templates}
                />
              </div>
            </div>
          );
        })}
        {webhooks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay ningún recordatorio de cita configurado.
          </p>
        )}
      </div>
    </div>
  );
}
