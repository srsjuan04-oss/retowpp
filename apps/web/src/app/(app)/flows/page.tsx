import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { listFlows } from "@/lib/flows/queries";
import { Badge } from "@/components/ui/badge";

export default async function FlowsPage() {
  const session = await requireRole("admin", "supervisor");
  const flows = await listFlows();

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Flujos</h1>
        {session.role === "admin" && (
          <Link href="/flows/new" className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
            Nuevo flujo
          </Link>
        )}
      </header>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Plantilla</th>
              <th className="px-3 py-2">WABA</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Creado</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((f) => (
              <tr key={f.id} className="border-t hover:bg-accent/50">
                <td className="px-3 py-2">
                  <Link href={`/flows/${f.id}`} className="font-medium hover:underline">
                    {f.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{f.templateName}</td>
                <td className="px-3 py-2 text-muted-foreground">{f.wabaBusinessName}</td>
                <td className="px-3 py-2">
                  <Badge variant={f.isActive ? "success" : "neutral"}>{f.isActive ? "activo" : "inactivo"}</Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {flows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Sin flujos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
