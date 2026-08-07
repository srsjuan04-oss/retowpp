"use client";

import { useActionState } from "react";
import { createTag, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function CreateTagForm() {
  const [state, formAction, pending] = useActionState(createTag, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="color">Color</Label>
        <Input id="color" name="color" type="color" defaultValue="#6b7280" className="h-9 w-16 p-1" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Crear etiqueta"}
      </Button>
    </form>
  );
}
