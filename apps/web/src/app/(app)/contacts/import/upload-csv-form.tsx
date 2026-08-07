"use client";

import { useActionState } from "react";
import { uploadContactsCsv, type UploadCsvState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: UploadCsvState = {};

export function UploadCsvForm() {
  const [state, formAction, pending] = useActionState(uploadContactsCsv, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
      <p className="text-xs text-muted-foreground">
        Columnas esperadas: <code>phone</code>, <code>name</code> (opcional), <code>tags</code> (opcional, separadas
        por coma). Cualquier otra columna se guarda como campo personalizado si ya está definido.
      </p>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">Archivo subido; se está procesando en segundo plano.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Subiendo…" : "Subir CSV"}
      </Button>
    </form>
  );
}
