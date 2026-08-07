"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAgentEnabled } from "./actions";
import { Button } from "@/components/ui/button";

export function AgentToggle({ isEnabled }: { isEnabled: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startAction] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={isEnabled ? "outline" : "default"}
        disabled={pending}
        className="self-start"
        onClick={() =>
          startAction(async () => {
            const result = await setAgentEnabled(!isEnabled);
            setError(result.error);
            if (result.success) router.refresh();
          })
        }
      >
        {pending ? "Guardando…" : isEnabled ? "Desactivar bot" : "Activar bot"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
