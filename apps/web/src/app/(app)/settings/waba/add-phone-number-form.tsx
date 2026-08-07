"use client";

import { useActionState } from "react";
import { addPhoneNumber, type AddPhoneNumberState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: AddPhoneNumberState = {};

export function AddPhoneNumberForm({ wabaAccounts }: { wabaAccounts: { id: string; business_name: string }[] }) {
  const [state, formAction, pending] = useActionState(addPhoneNumber, initialState);

  if (wabaAccounts.length === 0) {
    return <p className="text-sm text-muted-foreground">Conecta primero una WABA para poder agregar números.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="wabaAccountId">WABA</Label>
        <select
          id="wabaAccountId"
          name="wabaAccountId"
          required
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
          )}
        >
          {wabaAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.business_name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phoneNumberId">Phone Number ID</Label>
        <Input id="phoneNumberId" name="phoneNumberId" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayPhoneNumber">Número visible</Label>
        <Input id="displayPhoneNumber" name="displayPhoneNumber" placeholder="+52 55 1234 5678" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="label">Etiqueta (opcional)</Label>
        <Input id="label" name="label" placeholder="Ventas, Soporte…" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">Número agregado.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Agregando…" : "Agregar número"}
      </Button>
    </form>
  );
}
