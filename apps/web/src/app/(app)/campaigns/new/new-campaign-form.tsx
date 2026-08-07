"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { extractPlaceholderIndexes } from "@reto-whatsapp/core";
import { createCampaign, previewAudienceCount, type ActionState, type AudiencePreview } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TemplateOption } from "@/lib/templates/queries";
import type { PhoneNumberOption } from "@/lib/campaigns/queries";
import type { TagItem } from "@/lib/contacts/queries";

const initialState: ActionState = {};

export function NewCampaignForm({
  templates,
  phoneNumbers,
  tags,
}: {
  templates: TemplateOption[];
  phoneNumbers: PhoneNumberOption[];
  tags: TagItem[];
}) {
  const [state, formAction, pending] = useActionState(createCampaign, initialState);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewPending, startPreview] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

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

  function handlePreview() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    const includeTagIds = formData.getAll("includeTagIds").map(String);
    const excludeTagIds = formData.getAll("excludeTagIds").map(String);
    startPreview(async () => {
      setPreview(await previewAudienceCount(includeTagIds, excludeTagIds));
    });
  }

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay plantillas aprobadas. Sincronízalas en /templates.</p>;
  }
  if (phoneNumbers.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay números activos. Configúralos en /settings/waba.</p>;
  }

  return (
    <form ref={formRef} action={formAction} className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Label htmlFor="name">Nombre de la campaña</Label>
        <Input id="name" name="name" required />
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
            Variables de la plantilla. Puedes usar <code>{"{{contact.display_name}}"}</code> o el nombre de un campo
            personalizado como <code>{"{{contact.mi_campo}}"}</code> para personalizar por destinatario.
          </p>
          {variableIndexes.map((i) => (
            <Input key={i} name={`var_${i}`} placeholder={`Variable {{${i}}}`} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm font-medium">Incluir etiquetas</p>
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="includeTagIds" value={tag.id} />
              {tag.name}
            </label>
          ))}
          {tags.length === 0 && <p className="text-xs text-muted-foreground">Sin etiquetas.</p>}
        </div>
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm font-medium">Excluir etiquetas</p>
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="excludeTagIds" value={tag.id} />
              {tag.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={handlePreview} disabled={previewPending} className="self-start">
          {previewPending ? "Calculando…" : "Vista previa de destinatarios"}
        </Button>
        {preview && (
          <p className="text-sm text-muted-foreground">
            {preview.count} destinatarios suscritos coinciden.
            {preview.sample.length > 0 && ` Ejemplo: ${preview.sample.map((s) => s.displayName ?? s.waId).join(", ")}`}
            {preview.count > preview.sample.length ? "…" : ""}
          </p>
        )}
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Creando…" : "Crear campaña (borrador)"}
      </Button>
    </form>
  );
}
