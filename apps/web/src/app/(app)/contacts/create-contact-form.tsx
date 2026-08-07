"use client";

import { useActionState } from "react";
import { createContact, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TagItem } from "@/lib/contacts/queries";

const initialState: ActionState = {};

export function CreateContactForm({ tags }: { tags: TagItem[] }) {
  const [state, formAction, pending] = useActionState(createContact, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="waId">Teléfono (con código de país)</Label>
        <Input id="waId" name="waId" placeholder="5215512345678" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="displayName">Nombre</Label>
        <Input id="displayName" name="displayName" />
      </div>
      {tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label>Etiquetas</Label>
          <div className="flex flex-col gap-1">
            {tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="tagIds" value={tag.id} />
                <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: tag.color }}>
                  {tag.name}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Crear contacto"}
      </Button>
    </form>
  );
}
