"use client";

import { useActionState } from "react";
import { updateContactName, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

export function ContactNameForm({ contactId, displayName }: { contactId: string; displayName: string | null }) {
  const [state, formAction, pending] = useActionState(updateContactName, initialState);

  return (
    <form action={formAction} className="flex gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <Input name="displayName" defaultValue={displayName ?? ""} className="max-w-sm" />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
