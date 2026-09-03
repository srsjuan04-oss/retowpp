import Link from "next/link";
import type { ConsentStatus } from "@reto-whatsapp/db";
import { listContacts, listTags } from "@/lib/contacts/queries";
import { formatContactName } from "@/lib/format";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { CreateContactForm } from "./create-contact-form";
import { CreateTagForm } from "./create-tag-form";

const CONSENT_LABELS: Record<ConsentStatus, string> = {
  subscribed: "Suscrito",
  unsubscribed: "Dado de baja",
  blocked: "Bloqueado",
  pending: "Pendiente",
};

const CONSENT_BADGE_VARIANTS: Record<ConsentStatus, BadgeProps["variant"]> = {
  subscribed: "success",
  unsubscribed: "neutral",
  blocked: "destructive",
  pending: "warning",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tag?: string; consent?: string }>;
}) {
  const { search, tag, consent } = await searchParams;
  const [contacts, tags] = await Promise.all([
    listContacts({
      search,
      tagId: tag,
      consentStatus: consent as ConsentStatus | undefined,
    }),
    listTags(),
  ]);

  return (
    <div className="flex flex-1 gap-8 p-8">
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="text-xl font-semibold">Contactos</h1>

        <form className="flex flex-wrap gap-2" method="get">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Buscar por nombre o teléfono…"
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          />
          <select
            name="consent"
            defaultValue={consent ?? ""}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Todos los consentimientos</option>
            {Object.entries(CONSENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-md border px-4 text-sm hover:bg-accent">
            Filtrar
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/contacts"
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${!tag ? "border-brand bg-brand/10 text-brand" : "hover:bg-accent"}`}
          >
            Todas las etiquetas
          </Link>
          {tags.map((t) => (
            <Link
              key={t.id}
              href={`/contacts?tag=${t.id}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${tag === t.id ? "bg-accent" : "hover:bg-accent/50"}`}
              style={{ borderColor: t.color }}
            >
              {t.name}
            </Link>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2">Teléfono</th>
                <th className="px-3 py-2">Consentimiento</th>
                <th className="px-3 py-2">Etiquetas</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-t hover:bg-accent/50">
                  <td className="px-3 py-2">
                    <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                      {formatContactName(c.displayName) ?? "(sin nombre)"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.waId}</td>
                  <td className="px-3 py-2">
                    <Badge variant={CONSENT_BADGE_VARIANTS[c.consentStatus]}>{CONSENT_LABELS[c.consentStatus]}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t.id} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: t.color }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No hay contactos con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="flex w-80 shrink-0 flex-col gap-8">
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Nuevo contacto</h2>
          <CreateContactForm tags={tags} />
        </section>
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Nueva etiqueta</h2>
          <CreateTagForm />
        </section>
        <Link href="/contacts/import" className="rounded-md border px-4 py-2 text-center text-sm hover:bg-accent">
          Importar contactos (CSV)
        </Link>
      </aside>
    </div>
  );
}
