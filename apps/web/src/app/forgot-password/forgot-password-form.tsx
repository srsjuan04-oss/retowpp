"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state?.success) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4 text-center">
        <p className="text-sm text-foreground">
          Si ese correo tiene una cuenta, te enviamos un enlace para restablecer tu contraseña.
        </p>
        <Link href="/login" className="text-sm text-brand hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace de recuperación"}
      </Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
        Volver a iniciar sesión
      </Link>
    </form>
  );
}
