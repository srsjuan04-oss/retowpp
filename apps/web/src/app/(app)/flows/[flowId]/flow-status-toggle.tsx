"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFlowActive } from "../actions";
import { Button } from "@/components/ui/button";

export function FlowStatusToggle({ flowId, isActive }: { flowId: string; isActive: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startAction] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={isActive ? "outline" : "default"}
        disabled={pending}
        className="self-start"
        onClick={() =>
          startAction(async () => {
            const result = await setFlowActive(flowId, !isActive);
            setError(result.error);
            if (result.success) router.refresh();
          })
        }
      >
        {pending ? "Guardando…" : isActive ? "Desactivar flujo" : "Activar flujo"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
