"use client";

import { useActionState } from "react";
import { createCustomFieldDefinition, type ActionState } from "@/app/(app)/contacts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function CreateCustomFieldForm() {
  const [state, formAction, pending] = useActionState(createCustomFieldDefinition, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="key">Clave (snake_case)</Label>
        <Input id="key" name="key" placeholder="fecha_nacimiento" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="label">Etiqueta</Label>
        <Input id="label" name="label" placeholder="Fecha de nacimiento" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="fieldType">Tipo</Label>
        <select id="fieldType" name="fieldType" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="text">Texto</option>
          <option value="number">Número</option>
          <option value="date">Fecha</option>
          <option value="boolean">Sí/No</option>
          <option value="select">Selección</option>
        </select>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Crear campo"}
      </Button>
    </form>
  );
}
