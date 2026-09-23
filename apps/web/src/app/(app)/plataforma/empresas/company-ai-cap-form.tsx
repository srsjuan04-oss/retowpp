"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCompanyAiCap } from "./actions";

export function CompanyAiCapForm({
  companyId,
  usageUsd,
  capUsd,
  usesOwnKey,
}: {
  companyId: string;
  usageUsd: number;
  capUsd: number | null;
  usesOwnKey: boolean;
}) {
  const [value, setValue] = useState(capUsd?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startAction] = useTransition();
  const router = useRouter();
  const overCap = capUsd != null && usageUsd >= capUsd;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={overCap ? "font-medium text-destructive" : "text-muted-foreground"}>
        IA: ${usageUsd.toFixed(2)}
        {capUsd != null ? ` / $${capUsd.toFixed(2)}` : " (sin tope)"}
        {usesOwnKey && " · key propia"}
      </span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Cupo mensual de IA en USD"
        className="h-7 w-20 rounded-md border border-input bg-background px-2"
      />
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        disabled={pending || value === "" || Number(value) === capUsd}
        onClick={() =>
          startAction(async () => {
            const result = await setCompanyAiCap(companyId, Number(value));
            setError(result.error ?? null);
            if (!result.error) router.refresh();
          })
        }
      >
        {pending ? "Guardando…" : "Guardar cupo"}
      </button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
