"use client";

import { useActionState } from "react";
import { updateContactCustomField, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomFieldDefinition } from "@/lib/contacts/queries";

const initialState: ActionState = {};

function CustomFieldRow({
  contactId,
  definition,
  value,
}: {
  contactId: string;
  definition: CustomFieldDefinition;
  value: unknown;
}) {
  const [state, formAction, pending] = useActionState(updateContactCustomField, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="key" value={definition.key} />
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={`cf-${definition.key}`}>{definition.label}</Label>
        <Input
          id={`cf-${definition.key}`}
          name="value"
          type={definition.fieldType === "number" ? "number" : definition.fieldType === "date" ? "date" : "text"}
          defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        />
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "…" : "Guardar"}
      </Button>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function CustomFieldsEditor({
  contactId,
  definitions,
  values,
}: {
  contactId: string;
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown>;
}) {
  if (definitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay campos personalizados definidos. Un admin puede crearlos en Configuración.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {definitions.map((def) => (
        <CustomFieldRow
          key={`${def.id}-${String(values[def.key] ?? "")}`}
          contactId={contactId}
          definition={def}
          value={values[def.key]}
        />
      ))}
    </div>
  );
}
