"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignStatus } from "@reto-whatsapp/db";
import { cancelCampaign, lockRecipients, pauseCampaign, resumeCampaign, startCampaign, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";

export function CampaignActions({ campaignId, status }: { campaignId: string; status: CampaignStatus }) {
  const [error, setError] = useState<string | undefined>();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [pending, startAction] = useTransition();
  const router = useRouter();

  const run = (action: (id: string) => Promise<ActionState>) =>
    startAction(async () => {
      const result = await action(campaignId);
      setError(result.error);
      if (result.success) router.refresh();
    });

  const cancelButton = (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        // Confirmación en línea con un segundo clic, sin diálogos del navegador.
        if (!confirmingCancel) return setConfirmingCancel(true);
        setConfirmingCancel(false);
        run(cancelCampaign);
      }}
      className="text-destructive"
    >
      {confirmingCancel ? "Confirmar: cancelar envío" : "Cancelar campaña"}
    </Button>
  );

  if (status === "draft") {
    return (
      <div className="flex flex-col gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startAction(async () => {
              const result = await lockRecipients(campaignId);
              setError(result.error);
              if (result.success) router.refresh();
            })
          }
        >
          {pending ? "Confirmando…" : "Confirmar destinatarios y continuar"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (status === "recipients_locked") {
    return (
      <div className="flex flex-col gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startAction(async () => {
              const result = await startCampaign(campaignId);
              setError(result.error);
              if (result.success) router.refresh();
            })
          }
        >
          {pending ? "Iniciando…" : "Iniciar campaña"}
        </Button>
        {cancelButton}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (status === "queued" || status === "running" || status === "paused") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {status === "paused" ? (
            <Button disabled={pending} onClick={() => run(resumeCampaign)}>
              Reanudar envío
            </Button>
          ) : (
            <Button variant="outline" disabled={pending} onClick={() => run(pauseCampaign)}>
              Pausar envío
            </Button>
          )}
          {cancelButton}
        </div>
        {status === "paused" && (
          <p className="text-xs text-muted-foreground">En pausa: los mensajes pendientes esperan hasta que la reanudes.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return null;
}
