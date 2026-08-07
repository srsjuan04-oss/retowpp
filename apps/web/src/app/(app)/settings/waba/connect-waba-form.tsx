"use client";

import { useActionState } from "react";
import { connectWaba, type ConnectWabaState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ConnectWabaState = {};

export function ConnectWabaForm() {
  const [state, formAction, pending] = useActionState(connectWaba, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="wabaId">WABA ID</Label>
        <Input id="wabaId" name="wabaId" autoComplete="off" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="businessName">Nombre del negocio</Label>
        <Input id="businessName" name="businessName" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="accessToken">Access token (System User)</Label>
        <Input id="accessToken" name="accessToken" type="password" autoComplete="new-password" required />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">WABA conectada.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Conectando…" : "Conectar WABA"}
      </Button>
    </form>
  );
}
