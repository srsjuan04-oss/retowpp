"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMcpServer, setMcpServerActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import type { McpServerItem } from "@/lib/ai-agent/queries";

export function McpServerList({ servers }: { servers: McpServerItem[] }) {
  const router = useRouter();
  const [pending, startAction] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (servers.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin servidores MCP todavía.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">URL</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="px-3 py-2 font-medium">{s.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{s.url}</td>
              <td className="px-3 py-2">
                <Badge variant={s.isActive ? "success" : "neutral"}>{s.isActive ? "activo" : "inactivo"}</Badge>
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-3 text-xs">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    disabled={pending}
                    onClick={() => {
                      setBusyId(s.id);
                      startAction(async () => {
                        await setMcpServerActive(s.id, !s.isActive);
                        router.refresh();
                      });
                    }}
                  >
                    {pending && busyId === s.id ? "Guardando…" : s.isActive ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={pending}
                    onClick={() => {
                      setBusyId(s.id);
                      startAction(async () => {
                        await deleteMcpServer(s.id);
                        router.refresh();
                      });
                    }}
                  >
                    {pending && busyId === s.id ? "Eliminando…" : "Eliminar"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
