import { requirePlatformAdmin } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateCompanyForm } from "./create-company-form";
import { CompanyActiveToggle } from "./company-active-toggle";
import { CompanyAiCapForm } from "./company-ai-cap-form";
import { DEFAULT_AI_MONTHLY_CAP_USD } from "@/lib/ai-agent/queries";

export default async function EmpresasPage() {
  await requirePlatformAdmin();
  const supabase = createAdminClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, is_active, created_at")
    .order("created_at", { ascending: false });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: aiSettings }, { data: usageRows }] = await Promise.all([
    supabase.from("ai_agent_settings").select("company_id, ai_monthly_cap_usd, anthropic_api_key_encrypted"),
    supabase.from("ai_usage_log").select("company_id, cost_usd").gte("created_at", monthStart.toISOString()),
  ]);
  // La key cifrada se lee solo para saber si la empresa tiene una propia; nunca sale del servidor.
  const aiByCompany = new Map(
    (aiSettings ?? []).map((s) => [
      s.company_id,
      { capUsd: s.ai_monthly_cap_usd, usesOwnKey: Boolean(s.anthropic_api_key_encrypted) },
    ]),
  );
  const usageByCompany = new Map<string, number>();
  for (const row of usageRows ?? []) {
    usageByCompany.set(row.company_id, (usageByCompany.get(row.company_id) ?? 0) + Number(row.cost_usd));
  }

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
              <div className="flex items-center gap-6">
                <CompanyAiCapForm
                  companyId={company.id}
                  usageUsd={usageByCompany.get(company.id) ?? 0}
                  capUsd={
                    // Mismo criterio que el worker: con la key de la plataforma siempre hay tope.
                    aiByCompany.get(company.id)?.capUsd ??
                    (aiByCompany.get(company.id)?.usesOwnKey ? null : DEFAULT_AI_MONTHLY_CAP_USD)
                  }
                  usesOwnKey={aiByCompany.get(company.id)?.usesOwnKey ?? false}
                />
                <CompanyActiveToggle companyId={company.id} isActive={company.is_active} />
              </div>
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
