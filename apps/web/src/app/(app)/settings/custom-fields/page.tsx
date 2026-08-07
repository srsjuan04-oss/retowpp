import { requireRole } from "@/lib/auth/dal";
import { listCustomFieldDefinitions } from "@/lib/contacts/queries";
import { CreateCustomFieldForm } from "./create-custom-field-form";

export default async function CustomFieldsSettingsPage() {
  await requireRole("admin");
  const definitions = await listCustomFieldDefinitions();

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <h1 className="text-xl font-semibold">Campos personalizados</h1>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Definidos</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {definitions.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>{d.label}</span>
              <span className="text-muted-foreground">
                {d.key} · {d.fieldType}
              </span>
            </li>
          ))}
          {definitions.length === 0 && <li className="text-muted-foreground">Aún no hay campos definidos.</li>}
        </ul>
      </section>

      <section className="flex max-w-sm flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Nuevo campo</h2>
        <CreateCustomFieldForm />
      </section>
    </div>
  );
}
