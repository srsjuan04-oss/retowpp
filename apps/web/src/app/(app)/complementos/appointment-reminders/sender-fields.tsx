"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import type { ReminderSenderOption, ReminderTemplateOption } from "@/lib/complementos/appointment-reminder-queries";

/**
 * Selector de número + plantilla. Las plantillas se filtran a la WABA del número
 * elegido, porque Meta rechaza enviar una plantilla desde un número de otra cuenta.
 */
export function SenderAndTemplateFields({
  idPrefix,
  phoneNumbers,
  templates,
  defaultPhoneNumberId,
  defaultTemplateId,
  size = "md",
}: {
  idPrefix: string;
  phoneNumbers: ReminderSenderOption[];
  templates: ReminderTemplateOption[];
  defaultPhoneNumberId?: string;
  defaultTemplateId?: string | null;
  size?: "sm" | "md";
}) {
  // Un número que ya no está activo (ej. el de una WABA desactivada) no está en la lista:
  // se arranca en "" para obligar a elegir uno válido en vez de mostrar otro por defecto.
  const initialPhone = phoneNumbers.some((p) => p.id === defaultPhoneNumberId)
    ? (defaultPhoneNumberId ?? "")
    : size === "md"
      ? (phoneNumbers[0]?.id ?? "")
      : "";
  const [phoneNumberId, setPhoneNumberId] = useState(initialPhone);
  const wabaAccountId = phoneNumbers.find((p) => p.id === phoneNumberId)?.wabaAccountId;
  const available = templates.filter((t) => t.wabaAccountId === wabaAccountId);
  const [templateId, setTemplateId] = useState(
    available.some((t) => t.id === defaultTemplateId) ? (defaultTemplateId ?? "") : (available[0]?.id ?? ""),
  );

  const selectClass =
    size === "sm"
      ? "h-8 rounded-md border border-input bg-background px-2 text-xs"
      : "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-phone`} className="text-xs">
          Enviar desde
        </Label>
        <select
          id={`${idPrefix}-phone`}
          name="phoneNumberId"
          value={phoneNumberId}
          onChange={(e) => {
            const next = e.target.value;
            setPhoneNumberId(next);
            const nextWaba = phoneNumbers.find((p) => p.id === next)?.wabaAccountId;
            setTemplateId(templates.find((t) => t.wabaAccountId === nextWaba)?.id ?? "");
          }}
          required
          className={selectClass}
        >
          <option value="" disabled>
            Elegir número…
          </option>
          {phoneNumbers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-template`} className="text-xs">
          Plantilla
        </Label>
        <select
          id={`${idPrefix}-template`}
          name="templateId"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          required
          disabled={available.length === 0}
          className={selectClass}
        >
          <option value="" disabled>
            {phoneNumberId && available.length === 0 ? "Esta cuenta no tiene plantillas aprobadas" : "Elegir plantilla…"}
          </option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
