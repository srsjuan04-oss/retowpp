"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBranch, deleteBranch, deleteStep, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { FlowBranchItem, FlowStepItem } from "@/lib/flows/queries";

const CONTENT_TYPE_LABEL: Record<FlowStepItem["contentType"], string> = {
  text: "Texto",
  image: "Imagen",
  audio: "Audio",
};

const initialState: ActionState = {};

function branchDescription(branch: FlowBranchItem): string {
  if (branch.matchType === "any") return "Cualquier respuesta";
  if (branch.matchType === "equals") return `Responde exactamente "${branch.matchValue}"`;
  return `El mensaje contiene "${branch.matchValue}"`;
}

export function FlowStepCard({
  flowId,
  step,
  branches,
  otherSteps,
  isAdmin,
}: {
  flowId: string;
  step: FlowStepItem;
  branches: FlowBranchItem[];
  otherSteps: FlowStepItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [deletingStep, startDeleteStep] = useTransition();
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [deleteBranchPending, startDeleteBranch] = useTransition();
  const [branchState, branchFormAction, branchPending] = useActionState(addBranch, initialState);

  const stepLabelById = new Map(otherSteps.map((s) => [s.id, `Paso ${s.order}`]));

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Paso {step.order} · {CONTENT_TYPE_LABEL[step.contentType]}
        </p>
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            disabled={deletingStep}
            onClick={() =>
              startDeleteStep(async () => {
                await deleteStep(flowId, step.id);
                router.refresh();
              })
            }
          >
            {deletingStep ? "Eliminando…" : "Eliminar paso"}
          </Button>
        )}
      </div>

      {step.contentType === "text" && <p className="text-sm text-muted-foreground">{step.textBody}</p>}
      {step.contentType === "image" && step.mediaSignedUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={step.mediaSignedUrl} alt="" className="max-h-48 w-auto rounded-md border" />
      )}
      {step.contentType === "audio" && step.mediaSignedUrl && (
        <audio controls src={step.mediaSignedUrl} className="w-full max-w-sm" />
      )}

      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Ramas</p>
        {branches.length === 0 && <p className="text-xs text-muted-foreground">Sin ramas: el flujo termina aquí.</p>}
        {branches.map((branch) => (
          <div key={branch.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs">
            <span>
              {branchDescription(branch)} → {branch.toStepId ? stepLabelById.get(branch.toStepId) ?? "?" : "Termina el flujo"}
            </span>
            {isAdmin && (
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                disabled={deleteBranchPending}
                onClick={() => {
                  setDeletingBranchId(branch.id);
                  startDeleteBranch(async () => {
                    await deleteBranch(flowId, branch.id);
                    router.refresh();
                  });
                }}
              >
                {deleteBranchPending && deletingBranchId === branch.id ? "Eliminando…" : "Eliminar"}
              </button>
            )}
          </div>
        ))}

        {isAdmin && <AddBranchInlineForm flowId={flowId} stepId={step.id} otherSteps={otherSteps} state={branchState} formAction={branchFormAction} pending={branchPending} />}
      </div>
    </div>
  );
}

function AddBranchInlineForm({
  flowId,
  stepId,
  otherSteps,
  state,
  formAction,
  pending,
}: {
  flowId: string;
  stepId: string;
  otherSteps: FlowStepItem[];
  state: ActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const [matchType, setMatchType] = useState<"any" | "equals" | "contains">("any");

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
      <input type="hidden" name="flowId" value={flowId} />
      <input type="hidden" name="fromStepId" value={stepId} />

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Condición</Label>
        <select
          name="matchType"
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as typeof matchType)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="any">Cualquiera</option>
          <option value="equals">Es exactamente</option>
          <option value="contains">Contiene</option>
        </select>
      </div>

      {matchType !== "any" && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Texto</Label>
          <Input name="matchValue" className="h-8 w-40 text-xs" required />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Continúa en</Label>
        <select name="toStepId" className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="">Termina el flujo</option>
          {otherSteps.map((s) => (
            <option key={s.id} value={s.id}>
              Paso {s.order}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Prioridad</Label>
        <Input name="priority" type="number" defaultValue={0} className="h-8 w-16 text-xs" />
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Agregando…" : "Agregar rama"}
      </Button>
      {state?.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
