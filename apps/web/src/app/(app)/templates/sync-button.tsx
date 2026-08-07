"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerTemplateSync } from "./actions";
import { Button } from "@/components/ui/button";

export function SyncTemplatesButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await triggerTemplateSync();
          // El job se procesa async en el worker; sin este timer la tabla se queda
          // desactualizada hasta que el usuario recargue la página a mano.
          setTimeout(() => router.refresh(), 4000);
        })
      }
    >
      {pending ? "Encolando…" : "Sincronizar ahora"}
    </Button>
  );
}
