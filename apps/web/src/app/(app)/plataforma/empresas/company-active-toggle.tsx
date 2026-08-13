"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCompanyActive } from "./actions";
import { Badge } from "@/components/ui/badge";

export function CompanyActiveToggle({ companyId, isActive }: { companyId: string; isActive: boolean }) {
  const [pending, startAction] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-3 text-xs">
      <Badge variant={isActive ? "success" : "neutral"}>{isActive ? "activa" : "inactiva"}</Badge>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        disabled={pending}
        onClick={() =>
          startAction(async () => {
            await setCompanyActive(companyId, !isActive);
            router.refresh();
          })
        }
      >
        {pending ? "Guardando…" : isActive ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}
