"use client";

import { useActionState } from "react";
import { addMcpServer, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function McpServerForm() {
  const [state, formAction, pending] = useActionState(addMcpServer, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="mcpUrl">URL</Label>
        <Input id="mcpUrl" name="url" placeholder="https://mcp.example.com" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="mcpName">Nombre</Label>
        <Input id="mcpName" name="name" placeholder="my_mcp_server" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="mcpToken">Authentication — Access token / API key (opcional)</Label>
        <Input id="mcpToken" name="authorizationToken" type="password" autoComplete="new-password" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Agregando…" : "Añadir Nuevo"}
      </Button>
    </form>
  );
}
