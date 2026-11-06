"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export interface VariableFieldOption {
  key: string;
  label: string;
}

const FIXED_TEXT = "__fixed__";

/**
 * Selector de qué dato va en cada {{n}} de la plantilla. Solo ofrece lo que la
 * campaña sabe resolver, así no se pueden escribir variables inexistentes
 * (p. ej. {{hotmart.…}}, que solo existen en el complemento de Hotmart).
 */
export function VariablePicker({ index, customFields }: { index: number; customFields: VariableFieldOption[] }) {
  const [choice, setChoice] = useState("");
  const [fixedText, setFixedText] = useState("");

  const value = choice === FIXED_TEXT ? fixedText : choice ? `{{contact.${choice}}}` : "";

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`var_choice_${index}`} className="text-xs font-medium">
        Variable {`{{${index}}}`}
      </label>
      <div className="flex gap-2">
        <select
          id={`var_choice_${index}`}
          required
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="h-9 min-w-56 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="" disabled>
            Elige qué dato va aquí…
          </option>
          <optgroup label="Datos del contacto">
            <option value="display_name">Nombre del contacto</option>
            <option value="wa_id">Teléfono del contacto</option>
          </optgroup>
          {customFields.length > 0 && (
            <optgroup label="Campos personalizados">
              {customFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Otro">
            <option value={FIXED_TEXT}>Texto fijo (igual para todos)</option>
          </optgroup>
        </select>
        {choice === FIXED_TEXT && (
          <Input
            required
            value={fixedText}
            onChange={(e) => setFixedText(e.target.value)}
            placeholder="Ej.: Black Friday"
            className="flex-1"
          />
        )}
      </div>
      {choice === "display_name" && (
        <p className="text-xs text-muted-foreground">Los contactos sin nombre recibirán este espacio vacío.</p>
      )}
      <input type="hidden" name={`var_${index}`} value={value} />
    </div>
  );
}
