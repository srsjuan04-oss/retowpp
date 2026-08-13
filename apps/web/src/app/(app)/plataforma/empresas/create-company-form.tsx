"use client";

import { useActionState } from "react";
import { createCompany, type CreateCompanyState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CreateCompanyState = {};

export function CreateCompanyForm() {
  const [state, formAction, pending] = useActionState(createCompany, initialState);

  if (state?.success) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-brand/30 bg-brand/5 p-4 text-sm">
        <p className="font-medium">
          {state.success.companyName} quedó creada, junto con su primer usuario ({state.success.adminEmail}).
        </p>
        <p>
          Contraseña temporal: <code className="rounded bg-secondary px-1.5 py-0.5">{state.success.tempPassword}</code>
        </p>
        <p className="text-muted-foreground">
          Copiala ahora — no se vuelve a mostrar. Pasásela al cliente para que entre y la cambie.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="companyName">Nombre de la empresa</Label>
        <Input id="companyName" name="companyName" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adminFullName">Nombre del primer usuario (opcional)</Label>
        <Input id="adminFullName" name="adminFullName" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adminEmail">Correo del primer usuario</Label>
        <Input id="adminEmail" name="adminEmail" type="email" autoComplete="off" required />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Creando…" : "Crear empresa"}
      </Button>
    </form>
  );
}
