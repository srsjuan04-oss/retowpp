"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPhoneNumberAiAgentEnabled } from "./actions";

interface PhoneNumberItem {
  id: string;
  phone_number_id: string;
  display_phone_number: string;
  label: string | null;
  is_active: boolean;
  ai_agent_enabled: boolean;
}

export function PhoneNumberList({ phoneNumbers, canToggle }: { phoneNumbers: PhoneNumberItem[]; canToggle: boolean }) {
  const router = useRouter();
  const [pending, startAction] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  if (phoneNumbers.length === 0) {
    return <li className="text-muted-foreground">Aún no hay números registrados.</li>;
  }

  return (
    <>
      {phoneNumbers.map((phone) => (
        <li key={phone.id} className="flex items-center justify-between rounded-md border px-3 py-2">
          <span>
            {phone.display_phone_number}
            {phone.label ? ` · ${phone.label}` : ""}{" "}
            <span className="text-muted-foreground">({phone.phone_number_id})</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{phone.is_active ? "Activo" : "Inactivo"}</span>
            <span className="text-muted-foreground">Bot: {phone.ai_agent_enabled ? "activado" : "desactivado"}</span>
            {canToggle && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                disabled={pending}
                onClick={() => {
                  setBusyId(phone.id);
                  startAction(async () => {
                    const result = await setPhoneNumberAiAgentEnabled(phone.id, !phone.ai_agent_enabled);
                    setError(result.error);
                    if (result.success) router.refresh();
                  });
                }}
              >
                {pending && busyId === phone.id
                  ? "Guardando…"
                  : phone.ai_agent_enabled
                    ? "Desactivar bot"
                    : "Activar bot"}
              </button>
            )}
          </div>
        </li>
      ))}
      {error && <li className="text-sm text-destructive">{error}</li>}
    </>
  );
}
