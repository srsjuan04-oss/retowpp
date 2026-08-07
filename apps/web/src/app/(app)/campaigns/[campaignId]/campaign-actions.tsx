"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignStatus } from "@reto-whatsapp/db";
import { lockRecipients, startCampaign } from "../actions";
import { Button } from "@/components/ui/button";

export function CampaignActions({ campaignId, status }: { campaignId: string; status: CampaignStatus }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startAction] = useTransition();
  const router = useRouter();

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
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return null;
}
