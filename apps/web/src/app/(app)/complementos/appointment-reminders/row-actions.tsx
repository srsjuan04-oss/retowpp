"use client";

import { useActionState, useState } from "react";
import { setAppointmentReminderTemplate, toggleAppointmentReminderActive, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import type { TemplateOption } from "@/lib/templates/queries";

const initialState: ActionState = {};

export function AppointmentReminderRowActions({
  webhookId,
  webhookUrl,
  isActive,
  templateId,
  templates,
}: {
  webhookId: string;
  webhookUrl: string;
  isActive: boolean;
  templateId: string | null;
  templates: TemplateOption[];
}) {
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState(setAppointmentReminderTemplate, initialState);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(webhookUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copiado" : "Copiar URL"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void toggleAppointmentReminderActive(webhookId, !isActive)}>
          {isActive ? "Desactivar" : "Activar"}
        </Button>
      </div>

      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="webhookId" value={webhookId} />
        <select
          name="templateId"
          defaultValue={templateId ?? ""}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="" disabled>
            Elegir plantilla…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Asignar"}
        </Button>
      </form>
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
      {templates.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay plantillas aprobadas todavía. Sincronízalas en /templates.</p>
      )}
    </div>
  );
}
