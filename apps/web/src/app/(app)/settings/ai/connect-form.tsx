"use client";

import { useActionState } from "react";
import { connectAnthropic, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

const MODELS = [
  { value: "claude-opus-5", label: "Claude Opus 5 (más capaz)" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (equilibrado)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (rápido y económico)" },
];

export function ConnectForm({
  currentModel,
  currentSystemPrompt,
  currentAiMonthlyCapUsd,
  currentTopicRestriction,
  currentOffTopicReply,
  isConnected,
}: {
  currentModel?: string | undefined;
  currentSystemPrompt?: string | undefined;
  currentAiMonthlyCapUsd?: number | null | undefined;
  currentTopicRestriction?: boolean | undefined;
  currentOffTopicReply?: string | undefined;
  isConnected: boolean;
}) {
  const [state, formAction, pending] = useActionState(connectAnthropic, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="apiKey">API key de Anthropic</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          placeholder={isConnected ? "Dejar en blanco para no cambiarla" : "sk-ant-..."}
          autoComplete="new-password"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="model">Modelo</Label>
        <select
          id="model"
          name="model"
          defaultValue={currentModel ?? "claude-opus-5"}
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
      <div className="flex flex-col gap-1 border-t pt-3">
        <Label htmlFor="aiMonthlyCapUsd">Tope de gasto mensual en USD (opcional)</Label>
        <Input
          id="aiMonthlyCapUsd"
          name="aiMonthlyCapUsd"
          type="number"
          step="0.01"
          min="0"
          placeholder="Sin tope"
          defaultValue={currentAiMonthlyCapUsd ?? undefined}
        />
        <p className="text-xs text-muted-foreground">
          Al llegar al tope en el mes en curso, el bot deja de llamar a Claude y responde con un mensaje fijo hasta el
          siguiente mes.
        </p>
      </div>
      <div className="flex items-start gap-2 pt-1">
        <input
          id="topicRestriction"
          name="topicRestriction"
          type="checkbox"
          defaultChecked={currentTopicRestriction}
          className="mt-1 h-4 w-4 rounded border-input"
        />
        <Label htmlFor="topicRestriction" className="font-normal">
          Restringir el bot solo a temas del negocio (rechaza preguntas fuera de tema antes de llamar al modelo
          principal, con un clasificador económico).
        </Label>
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
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand">Guardado correctamente.</p>}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Guardando…" : isConnected ? "Actualizar" : "Conectar"}
      </Button>
    </form>
  );
}
