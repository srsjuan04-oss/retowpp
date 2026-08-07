"use client";

import { useActionState } from "react";
import type { ConsentStatus } from "@reto-whatsapp/db";
import { setConsentStatus, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

const OPTIONS: { value: ConsentStatus; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "subscribed", label: "Suscrito" },
  { value: "unsubscribed", label: "Dado de baja" },
  { value: "blocked", label: "Bloqueado" },
];

export function ConsentForm({
  contactId,
  consentStatus,
  consentSource,
}: {
  contactId: string;
  consentStatus: ConsentStatus;
  consentSource: string | null;
}) {
  const [state, formAction, pending] = useActionState(setConsentStatus, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Estado</label>
        <select
          name="consentStatus"
          defaultValue={consentStatus}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Motivo / fuente</label>
        <Input name="consentSource" defaultValue={consentSource ?? ""} placeholder="Ej: solicitó STOP" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Guardando…" : "Actualizar"}
      </Button>
      {state?.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
