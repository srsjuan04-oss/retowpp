import { notFound } from "next/navigation";
import { getContact, listCustomFieldDefinitions, listTags } from "@/lib/contacts/queries";
import { formatContactName } from "@/lib/format";
import { ContactNameForm } from "./contact-name-form";
import { ConsentForm } from "./consent-form";
import { TagsEditor } from "./tags-editor";
import { CustomFieldsEditor } from "./custom-fields-editor";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const [contact, allTags, fieldDefinitions] = await Promise.all([
    getContact(contactId),
    listTags(),
    listCustomFieldDefinitions(),
  ]);
  if (!contact) notFound();

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <h1 className="text-xl font-semibold">{formatContactName(contact.displayName) ?? contact.waId}</h1>
      <p className="text-sm text-muted-foreground">{contact.waId}</p>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Nombre</h2>
        <ContactNameForm
          key={`${contact.id}-${contact.displayName ?? ""}`}
          contactId={contact.id}
          displayName={contact.displayName}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Consentimiento / exclusión</h2>
        <ConsentForm
          key={`${contact.id}-${contact.consentStatus}-${contact.consentSource ?? ""}`}
          contactId={contact.id}
          consentStatus={contact.consentStatus}
          consentSource={contact.consentSource}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Etiquetas</h2>
        <TagsEditor contactId={contact.id} contactTags={contact.tags} allTags={allTags} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Campos personalizados</h2>
        <CustomFieldsEditor contactId={contact.id} definitions={fieldDefinitions} values={contact.customFields} />
      </section>
    </div>
  );
}
