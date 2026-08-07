import { requireRole } from "@/lib/auth/dal";
import { listAuditLog } from "@/lib/audit-log/queries";

const ENTITY_TYPES = ["profiles", "conversations", "contacts", "campaigns"];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string }>;
}) {
  await requireRole("admin", "supervisor");
  const { entityType } = await searchParams;
  const entries = await listAuditLog({ entityType });

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Historial de auditoría</h1>

      <form method="get" className="flex gap-2">
        <select
          name="entityType"
          defaultValue={entityType ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Todas las entidades</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-md border px-4 text-sm hover:bg-accent">
          Filtrar
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Acción</th>
              <th className="px-3 py-2">Entidad</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">{e.actorName}</td>
                <td className="px-3 py-2">{e.action}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer">
                      {e.entityType} {e.entityId ? `(${e.entityId.slice(0, 8)}…)` : ""}
                    </summary>
                    <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
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
