"use client";

import { useActionState, useState } from "react";
import { addStep, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function AddStepForm({ flowId }: { flowId: string }) {
  const [state, formAction, pending] = useActionState(addStep, initialState);
  const [contentType, setContentType] = useState<"text" | "image" | "audio">("text");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="flowId" value={flowId} />

      <div className="flex flex-col gap-1">
        <Label htmlFor="contentType">Tipo de contenido</Label>
        <select
          id="contentType"
          name="contentType"
          value={contentType}
          onChange={(e) => setContentType(e.target.value as typeof contentType)}
          className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="text">Texto</option>
          <option value="image">Imagen</option>
          <option value="audio">Audio</option>
        </select>
      </div>

      {contentType === "text" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="textBody">Mensaje</Label>
          <textarea
            id="textBody"
            name="textBody"
            rows={3}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label htmlFor="file">{contentType === "image" ? "Imagen" : "Audio"}</Label>
          <input
            id="file"
            name="file"
            type="file"
            accept={contentType === "image" ? "image/*" : "audio/*"}
            className="text-sm"
            required
          />
        </div>
      )}

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Agregando…" : "Agregar paso"}
      </Button>
    </form>
  );
}
