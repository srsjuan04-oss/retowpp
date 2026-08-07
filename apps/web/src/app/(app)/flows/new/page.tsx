import { requireRole } from "@/lib/auth/dal";
import { listActiveWabaAccounts, listApprovedTemplatesForFlows } from "@/lib/flows/queries";
import { NewFlowForm } from "./new-flow-form";

export default async function NewFlowPage() {
  await requireRole("admin");
  const [wabas, templates] = await Promise.all([listActiveWabaAccounts(), listApprovedTemplatesForFlows()]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Nuevo flujo</h1>
      <NewFlowForm wabas={wabas} templates={templates} />
    </div>
  );
}
