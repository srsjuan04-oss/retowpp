"use client";

import { useActionState, useMemo, useState } from "react";
import { extractPlaceholderIndexes } from "@reto-whatsapp/core";
import { createHotmartWebhook, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TemplateOption } from "@/lib/templates/queries";
import type { PhoneNumberOption } from "@/lib/campaigns/queries";

const initialState: ActionState = {};

const EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: "PURCHASE_APPROVED", label: "Compra aprobada" },
  { value: "PURCHASE_CANCELED", label: "Compra cancelada / rechazada" },
  { value: "PURCHASE_OUT_OF_SHOPPING_CART", label: "Carrito abandonado" },
];

export function CreateHotmartWebhookForm({
  templates,
  phoneNumbers,
}: {
  templates: TemplateOption[];
  phoneNumbers: PhoneNumberOption[];
}) {
  const [state, formAction, pending] = useActionState(createHotmartWebhook, initialState);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const variableIndexes = useMemo(() => {
    if (!selectedTemplate) return [];
    const indexes = new Set<number>();
    for (const component of selectedTemplate.components) {
      if (component.type === "BODY" || (component.type === "HEADER" && component.format === "TEXT")) {
        for (const i of extractPlaceholderIndexes(component.text)) indexes.add(i);
      }
    }
    return [...indexes].sort((a, b) => a - b);
  }, [selectedTemplate]);

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay plantillas aprobadas. Sincronízalas en /templates.</p>;
  }
  if (phoneNumbers.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay números activos. Configúralos en /settings/waba.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border p-4">
      <h2 className="text-sm font-medium">Crear webhook de Hotmart</h2>

      <div className="flex flex-col gap-1">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" placeholder="Ej. bienvenida curso X" required />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="event">Evento</Label>
        <select id="event" name="event" required className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {EVENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="phoneNumberId">Enviar desde</Label>
        <select
          id="phoneNumberId"
          name="phoneNumberId"
          required
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {phoneNumbers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="templateId">Plantilla</Label>
        <select
          id="templateId"
          name="templateId"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
      </div>

      {variableIndexes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            Variables de la plantilla. Usa <code>{"{{hotmart.buyer_name}}"}</code>,{" "}
            <code>{"{{hotmart.buyer_first_name}}"}</code>, <code>{"{{hotmart.product_name}}"}</code>,{" "}
            <code>{"{{hotmart.total}}"}</code>, <code>{"{{hotmart.currency}}"}</code> o{" "}
            <code>{"{{hotmart.transaction}}"}</code> para tomar el dato de la compra, o escribe texto fijo.
          </p>
          {variableIndexes.map((i) => (
            <Input key={i} name={`var_${i}`} placeholder={`Variable {{${i}}}`} />
          ))}
        </div>
      )}

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Creando…" : "Crear webhook"}
      </Button>
    </form>
  );
}
