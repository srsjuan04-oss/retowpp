import { requirePlatformAdmin } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateCompanyForm } from "./create-company-form";
import { CompanyActiveToggle } from "./company-active-toggle";

export default async function EmpresasPage() {
  await requirePlatformAdmin();
  const supabase = createAdminClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, is_active, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Empresas</h1>
        <p className="text-sm text-muted-foreground">
          Cada empresa tiene su propia conexión de WhatsApp Business y sus datos completamente aislados del resto.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-medium">Empresas registradas</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {(companies ?? []).map((company) => (
            <li key={company.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>{company.name}</span>
              <CompanyActiveToggle companyId={company.id} isActive={company.is_active} />
            </li>
          ))}
          {(companies ?? []).length === 0 && <li className="text-muted-foreground">Todavía no hay ninguna empresa.</li>}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-medium">Nueva empresa</h2>
        <p className="text-sm text-muted-foreground">
          Crea la empresa y su primer usuario (queda como administrador de esa empresa). La contraseña temporal se
          muestra una sola vez acá — pasásela al cliente para su primer ingreso.
        </p>
        <CreateCompanyForm />
      </section>
    </div>
  );
}
