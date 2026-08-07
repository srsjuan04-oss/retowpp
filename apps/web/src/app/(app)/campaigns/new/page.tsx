import { requireRole } from "@/lib/auth/dal";
import { listActivePhoneNumbers } from "@/lib/campaigns/queries";
import { listApprovedTemplates } from "@/lib/templates/queries";
import { listTags } from "@/lib/contacts/queries";
import { NewCampaignForm } from "./new-campaign-form";

export default async function NewCampaignPage() {
  await requireRole("admin", "supervisor");
  const [templates, phoneNumbers, tags] = await Promise.all([
    listApprovedTemplates(),
    listActivePhoneNumbers(),
    listTags(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Nueva campaña</h1>
      <NewCampaignForm templates={templates} phoneNumbers={phoneNumbers} tags={tags} />
    </div>
  );
}
