"use client";

import { useActionState } from "react";
import { connectAnthropic, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

const MODELS = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (recomendado)" },
  { value: "claude-opus-5", label: "Claude Opus 5 (más capaz, consume el cupo más rápido)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (rápido y económico)" },
];

/**
 * Lo que la empresa puede ajustar de su agente. La conexión con Claude la pone la
 * plataforma (no se pide API key) y el cupo mensual lo define el administrador de
 * plataforma, así que acá no aparecen.
 */
export function ConnectForm({
  currentModel,
  currentSystemPrompt,
  currentOffTopicReply,
}: {
  currentModel?: string | undefined;
  currentSystemPrompt?: string | undefined;
  currentOffTopicReply?: string | undefined;
}) {
  const [state, formAction, pending] = useActionState(connectAnthropic, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="model">Modelo</Label>
        <select
          id="model"
          name="model"
          defaultValue={currentModel ?? "claude-sonnet-5"}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="systemPrompt">Instrucciones para el agente (opcional)</Label>
        <textarea
          id="systemPrompt"
          name="systemPrompt"
          rows={4}
          defaultValue={currentSystemPrompt}
          placeholder="Eres un agente de servicio al cliente de..."
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="offTopicReply">Respuesta cuando el tema no aplica (opcional)</Label>
        <textarea
          id="offTopicReply"
          name="offTopicReply"
          rows={2}
          defaultValue={currentOffTopicReply}
          placeholder="Solo puedo ayudarte con temas de este negocio..."
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          El agente solo responde temas de tu negocio; a lo demás contesta con este mensaje.
        </p>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand">Guardado correctamente.</p>}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
