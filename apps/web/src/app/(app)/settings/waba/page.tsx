import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ConnectWabaForm } from "./connect-waba-form";
import { AddPhoneNumberForm } from "./add-phone-number-form";

export default async function WabaSettingsPage() {
  const session = await requireRole("admin", "supervisor");
  const supabase = await createClient();

  const { data: wabaAccounts } = await supabase
    .from("waba_accounts")
    .select("id, waba_id, business_name, is_active, created_at")
    .order("created_at", { ascending: false });

  const { data: phoneNumbers } = await supabase
    .from("phone_numbers")
    .select("id, waba_account_id, phone_number_id, display_phone_number, label, is_active")
    .order("created_at", { ascending: false });

  const isAdmin = session.role === "admin";

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <h1 className="text-xl font-semibold">Conexión WABA</h1>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-medium">WABA conectadas</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {(wabaAccounts ?? []).map((account) => (
            <li key={account.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>
                {account.business_name} <span className="text-muted-foreground">({account.waba_id})</span>
              </span>
              <span className="text-muted-foreground">{account.is_active ? "Activa" : "Inactiva"}</span>
            </li>
          ))}
          {(wabaAccounts ?? []).length === 0 && (
            <li className="text-muted-foreground">Aún no hay ninguna WABA conectada.</li>
          )}
        </ul>
        {isAdmin && <ConnectWabaForm />}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-medium">Phone Number IDs</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {(phoneNumbers ?? []).map((phone) => (
            <li key={phone.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>
                {phone.display_phone_number}
                {phone.label ? ` · ${phone.label}` : ""}{" "}
                <span className="text-muted-foreground">({phone.phone_number_id})</span>
              </span>
              <span className="text-muted-foreground">{phone.is_active ? "Activo" : "Inactivo"}</span>
            </li>
          ))}
          {(phoneNumbers ?? []).length === 0 && (
            <li className="text-muted-foreground">Aún no hay números registrados.</li>
          )}
        </ul>
        {isAdmin && <AddPhoneNumberForm wabaAccounts={wabaAccounts ?? []} />}
      </section>
    </div>
  );
}
