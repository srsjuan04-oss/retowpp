import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { listHotmartWebhookEvents } from "@/lib/complementos/hotmart-queries";
import { Badge } from "@/components/ui/badge";

export default async function HotmartHistorialPage() {
  await requireRole("admin", "supervisor");
  const events = await listHotmartWebhookEvents();

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <Link href="/complementos/hotmart" className="text-sm text-muted-foreground hover:underline">
          ← Hotmart
        </Link>
        <h1 className="text-xl font-semibold">Historial de eventos · Hotmart</h1>
      </header>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Evento</th>
              <th className="px-3 py-2">Webhook</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {new Date(e.receivedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.event}</td>
                <td className="px-3 py-2">{e.webhookName ?? "—"}</td>
                <td className="px-3 py-2">
                  {e.processingError ? (
                    <Badge variant="warning">{e.processingError}</Badge>
                  ) : e.processedAt ? (
                    <Badge variant="brand">OK</Badge>
                  ) : (
                    <Badge variant="neutral">pendiente</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">Ver payload</summary>
                    <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Sin eventos registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
