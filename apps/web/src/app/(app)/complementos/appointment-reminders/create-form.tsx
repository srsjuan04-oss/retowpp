"use client";

import { useActionState } from "react";
import { createAppointmentReminderWebhook, type ActionState } from "./actions";
import { SenderAndTemplateFields } from "./sender-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReminderSenderOption, ReminderTemplateOption } from "@/lib/complementos/appointment-reminder-queries";

const initialState: ActionState = {};

export function CreateAppointmentReminderForm({
  phoneNumbers,
  templates,
}: {
  phoneNumbers: ReminderSenderOption[];
  templates: ReminderTemplateOption[];
}) {
  const [state, formAction, pending] = useActionState(createAppointmentReminderWebhook, initialState);

  if (phoneNumbers.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay números activos. Configúralos en /settings/waba.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border p-4">
      <div>
        <h2 className="text-sm font-medium">Nuevo recordatorio</h2>
        <p className="text-xs text-muted-foreground">
          Cada recordatorio tiene su propia URL. Crea uno por cada anticipación (ej. 1 hora antes) y pega su URL en el
          recordatorio correspondiente de salon-pro.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="new-reminder-name" className="text-xs">
          Nombre
        </Label>
        <Input id="new-reminder-name" name="name" placeholder="Ej. 1 hora antes" required />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <SenderAndTemplateFields idPrefix="new-reminder" phoneNumbers={phoneNumbers} templates={templates} />
      </div>

      <p className="text-xs text-muted-foreground">
        La plantilla debe usar las variables en este orden: <code>{"{{1}}"}</code> nombre del cliente,{" "}
        <code>{"{{2}}"}</code> servicio, <code>{"{{3}}"}</code> barbero, <code>{"{{4}}"}</code> hora.
      </p>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Creando…" : "Crear recordatorio"}
      </Button>
    </form>
  );
}
