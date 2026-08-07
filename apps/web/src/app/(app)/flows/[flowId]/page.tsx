import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getFlow } from "@/lib/flows/queries";
import { Badge } from "@/components/ui/badge";
import { FlowStatusToggle } from "./flow-status-toggle";
import { AddStepForm } from "./add-step-form";
import { FlowStepCard } from "./flow-step-card";

export default async function FlowDetailPage({ params }: { params: Promise<{ flowId: string }> }) {
  const session = await requireRole("admin", "supervisor");
  const { flowId } = await params;

  const flow = await getFlow(flowId);
  if (!flow) notFound();

  const isAdmin = session.role === "admin";

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{flow.name}</h1>
        <Badge variant={flow.isActive ? "success" : "neutral"}>{flow.isActive ? "activo" : "inactivo"}</Badge>
      </header>

      <p className="text-sm text-muted-foreground">
        Dispara al responder a la plantilla <span className="font-medium text-foreground">{flow.templateName}</span> ·{" "}
        {flow.wabaBusinessName}
      </p>

      {isAdmin && <FlowStatusToggle flowId={flow.id} isActive={flow.isActive} />}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">Pasos</h2>
        {flow.steps.length === 0 && <p className="text-sm text-muted-foreground">Sin pasos todavía.</p>}
        {flow.steps.map((step) => (
          <FlowStepCard
            key={step.id}
            flowId={flow.id}
            step={step}
            branches={flow.branches.filter((b) => b.fromStepId === step.id)}
            otherSteps={flow.steps.filter((s) => s.id !== step.id)}
            isAdmin={isAdmin}
          />
        ))}
      </section>

      {isAdmin && (
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Agregar paso</h2>
          <AddStepForm flowId={flow.id} />
        </section>
      )}
    </div>
  );
}
