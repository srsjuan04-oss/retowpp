"use client";

import { useActionState, useState } from "react";
import { createFlow, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FlowTemplateOption, WabaOption } from "@/lib/flows/queries";

const initialState: ActionState = {};

export function NewFlowForm({ wabas, templates }: { wabas: WabaOption[]; templates: FlowTemplateOption[] }) {
  const [state, formAction, pending] = useActionState(createFlow, initialState);
  const [wabaAccountId, setWabaAccountId] = useState(wabas[0]?.id ?? "");
  const templatesForWaba = templates.filter((t) => t.wabaAccountId === wabaAccountId);

  if (wabas.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay WABA activas. Configúralas en /settings/waba.</p>;
  }
  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay plantillas aprobadas. Sincronízalas en /templates.</p>;
  }

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="name">Nombre del flujo</Label>
        <Input id="name" name="name" required />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="wabaAccountId">WABA</Label>
        <select
          id="wabaAccountId"
          name="wabaAccountId"
          value={wabaAccountId}
          onChange={(e) => setWabaAccountId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {wabas.map((w) => (
            <option key={w.id} value={w.id}>
              {w.businessName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="templateId">Plantilla que dispara el flujo</Label>
        <select id="templateId" name="templateId" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {templatesForWaba.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
        {templatesForWaba.length === 0 && (
          <p className="text-xs text-muted-foreground">Esa WABA no tiene plantillas aprobadas.</p>
        )}
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending || templatesForWaba.length === 0} className="self-start">
        {pending ? "Creando…" : "Crear flujo"}
      </Button>
    </form>
  );
}
