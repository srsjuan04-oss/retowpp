"use client";

import { useActionState, useMemo, useState } from "react";
import { extractPlaceholderIndexes } from "@reto-whatsapp/core";
import { sendTemplateMessage, type SendTemplateState } from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TemplateOption } from "@/lib/templates/queries";

const initialState: SendTemplateState = {};

export function TemplatePicker({ conversationId, templates }: { conversationId: string; templates: TemplateOption[] }) {
  const [state, formAction, pending] = useActionState(sendTemplateMessage, initialState);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");

  const selected = templates.find((t) => t.id === templateId);
  const variableIndexes = useMemo(() => {
    if (!selected) return [];
    const indexes = new Set<number>();
    for (const component of selected.components) {
      if (component.type === "BODY" || (component.type === "HEADER" && component.format === "TEXT")) {
        for (const i of extractPlaceholderIndexes(component.text)) indexes.add(i);
      }
    }
    return [...indexes].sort((a, b) => a - b);
  }, [selected]);

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay plantillas aprobadas sincronizadas. Un admin puede sincronizarlas en /templates.
      </p>
    );
  }

  return (
    <form
      action={(formData) => {
        formData.set("clientDedupeKey", crypto.randomUUID());
        formAction(formData);
      }}
      className="flex flex-col gap-2 rounded-md border p-3"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="templateId" value={templateId} />
      <select
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
      {variableIndexes.map((i) => (
        <Input key={i} name={`var_${i}`} placeholder={`Variable {{${i}}}`} required />
      ))}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Enviando…" : "Enviar plantilla"}
      </Button>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
