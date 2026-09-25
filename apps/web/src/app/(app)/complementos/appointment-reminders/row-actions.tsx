"use client";

import { useActionState, useState } from "react";
import { setAppointmentReminderSender, toggleAppointmentReminderActive, type ActionState } from "./actions";
import { SenderAndTemplateFields } from "./sender-fields";
import { Button } from "@/components/ui/button";
import type { ReminderSenderOption, ReminderTemplateOption } from "@/lib/complementos/appointment-reminder-queries";

const initialState: ActionState = {};

export function AppointmentReminderRowActions({
  webhookId,
  webhookUrl,
  isActive,
  phoneNumberId,
  templateId,
  phoneNumbers,
  templates,
}: {
  webhookId: string;
  webhookUrl: string;
  isActive: boolean;
  phoneNumberId: string;
  templateId: string | null;
  phoneNumbers: ReminderSenderOption[];
  templates: ReminderTemplateOption[];
}) {
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState(setAppointmentReminderSender, initialState);

  return (
    <div className="flex flex-col gap-3">
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

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="webhookId" value={webhookId} />
        <SenderAndTemplateFields
          idPrefix={webhookId}
          phoneNumbers={phoneNumbers}
          templates={templates}
          defaultPhoneNumberId={phoneNumberId}
          defaultTemplateId={templateId}
          size="sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state?.saved && !pending && <p className="text-xs text-muted-foreground">Guardado. La URL sigue siendo la misma.</p>}
    </div>
  );
}
