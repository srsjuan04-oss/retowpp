"use client";

import { useState } from "react";
import { deleteHotmartWebhook, toggleHotmartWebhookActive } from "./actions";
import { Button } from "@/components/ui/button";

export function HotmartWebhookRowActions({
  webhookId,
  webhookUrl,
  isActive,
}: {
  webhookId: string;
  webhookUrl: string;
  isActive: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(webhookUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copiado" : "Copiar URL"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => void toggleHotmartWebhookActive(webhookId, !isActive)}>
        {isActive ? "Desactivar" : "Activar"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (confirm("¿Eliminar este webhook? No se puede deshacer.")) void deleteHotmartWebhook(webhookId);
        }}
      >
        Eliminar
      </Button>
    </div>
  );
}
