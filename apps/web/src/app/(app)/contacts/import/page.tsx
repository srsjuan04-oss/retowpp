import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { UploadCsvForm } from "./upload-csv-form";

export default async function ContactImportPage() {
  await verifySession();
  const supabase = await createClient();

  const { data: imports } = await supabase
    .from("contact_imports")
    .select("id, status, total_rows, success_count, error_count, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <h1 className="text-xl font-semibold">Importar contactos</h1>

      <section className="max-w-lg rounded-lg border p-4">
        <UploadCsvForm />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Importaciones recientes</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {(imports ?? []).map((imp) => (
            <li key={imp.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>{new Date(imp.created_at).toLocaleString()}</span>
              <span className="text-muted-foreground">
                {imp.status} · {imp.success_count}/{imp.total_rows} ok · {imp.error_count} errores
              </span>
            </li>
          ))}
          {(imports ?? []).length === 0 && <li className="text-muted-foreground">Sin importaciones todavía.</li>}
        </ul>
      </section>
    </div>
  );
}
