"use client";

import { useActionState, useMemo, useState } from "react";
import { extractPlaceholderIndexes } from "@reto-whatsapp/core";
import { createTemplate, type CreateTemplateState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: CreateTemplateState = {};
const MAX_BUTTONS = 3;
const selectClassName = cn("flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm");

interface ButtonDraft {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url: string;
}

export function CreateTemplateForm({ wabaAccounts }: { wabaAccounts: { id: string; business_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createTemplate, initialState);
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);

  const headerIndexes = useMemo(() => extractPlaceholderIndexes(headerText), [headerText]);
  const bodyIndexes = useMemo(() => extractPlaceholderIndexes(bodyText), [bodyText]);

  if (wabaAccounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Conecta primero una WABA en Configuración para poder crear plantillas.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="wabaAccountId">WABA</Label>
        <select id="wabaAccountId" name="wabaAccountId" required className={selectClassName}>
          {wabaAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.business_name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" placeholder="confirmacion_cita" pattern="[a-z0-9_]+" required />
        <p className="text-xs text-muted-foreground">Solo minúsculas, números y guion bajo (lo exige Meta).</p>
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="category">Categoría</Label>
          <select id="category" name="category" required defaultValue="UTILITY" className={selectClassName}>
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utilidad</option>
            <option value="AUTHENTICATION">Autenticación</option>
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="language">Idioma</Label>
          <Input id="language" name="language" placeholder="es_MX" defaultValue="es_MX" required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="headerText">Encabezado (opcional)</Label>
        <Input
          id="headerText"
          name="headerText"
          value={headerText}
          onChange={(e) => setHeaderText(e.target.value)}
          placeholder="Recordatorio de cita"
        />
        {headerIndexes.map((i) => (
          <Input key={i} name={`header_example_${i}`} placeholder={`Ejemplo de {{${i}}} en el encabezado`} required />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bodyText">Cuerpo</Label>
        <textarea
          id="bodyText"
          name="bodyText"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          required
          rows={4}
          placeholder="Hola {{1}}, tu cita es el {{2}}."
          className={cn("flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm")}
        />
        {bodyIndexes.map((i) => (
          <Input key={i} name={`body_example_${i}`} placeholder={`Ejemplo de {{${i}}} en el cuerpo`} required />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="footerText">Pie (opcional)</Label>
        <Input id="footerText" name="footerText" placeholder="Responde STOP para dejar de recibir avisos" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Botones (opcional)</Label>
          {buttons.length < MAX_BUTTONS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "", url: "" }])}
            >
              + Botón
            </Button>
          )}
        </div>
        {buttons.map((button, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select
              value={button.type}
              onChange={(e) =>
                setButtons((prev) => prev.map((b, i) => (i === idx ? { ...b, type: e.target.value as ButtonDraft["type"] } : b)))
              }
              name={`button_type_${idx}`}
              className={cn("h-9 w-40 rounded-md border border-input bg-background px-2 text-sm shadow-sm")}
            >
              <option value="QUICK_REPLY">Respuesta rápida</option>
              <option value="URL">Enlace</option>
            </select>
            <Input
              value={button.text}
              onChange={(e) => setButtons((prev) => prev.map((b, i) => (i === idx ? { ...b, text: e.target.value } : b)))}
              name={`button_text_${idx}`}
              placeholder="Texto del botón"
              required
            />
            {button.type === "URL" && (
              <Input
                value={button.url}
                onChange={(e) => setButtons((prev) => prev.map((b, i) => (i === idx ? { ...b, url: e.target.value } : b)))}
                name={`button_url_${idx}`}
                placeholder="https://…"
                required
              />
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setButtons((prev) => prev.filter((_, i) => i !== idx))}>
              Quitar
            </Button>
          </div>
        ))}
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">Plantilla enviada a Meta para revisión.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Creando…" : "Crear plantilla"}
      </Button>
    </form>
  );
}
