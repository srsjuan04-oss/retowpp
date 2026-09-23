import { requireRole } from "@/lib/auth/dal";
import {
  DEFAULT_AI_MONTHLY_CAP_USD,
  getAiAgentSettings,
  getCurrentMonthAiUsageUsd,
  listMcpServers,
} from "@/lib/ai-agent/queries";
import { Badge } from "@/components/ui/badge";
import { ConnectForm } from "./connect-form";
import { AgentToggle } from "./agent-toggle";
import { McpServerForm } from "./mcp-server-form";
import { McpServerList } from "./mcp-server-list";

export default async function AiAgentSettingsPage() {
  await requireRole("admin");
  const [settings, mcpServers, monthlyUsageUsd] = await Promise.all([
    getAiAgentSettings(),
    listMcpServers(),
    getCurrentMonthAiUsageUsd(),
  ]);
  // Sin fila todavía = empresa nueva con la key de la plataforma: aplica el cupo por defecto.
  const monthlyCapUsd = settings ? settings.aiMonthlyCapUsd : DEFAULT_AI_MONTHLY_CAP_USD;

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <h1 className="text-xl font-semibold">Asistente de IA</h1>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium">Agente de IA</h2>
          <Badge variant="success">incluido en tu plan</Badge>
        </div>
        <div>
          <AgentToggle isEnabled={settings?.isEnabled ?? false} />
          <p className="mt-2 text-xs text-muted-foreground">
            {settings?.isEnabled
              ? "El bot está activo: responderá automáticamente a los mensajes entrantes."
              : "El bot está inactivo: los mensajes entrantes no reciben respuesta automática."}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Uso de IA este mes: <span className="font-medium text-foreground">${monthlyUsageUsd.toFixed(2)}</span>
            {monthlyCapUsd != null && <> de ${monthlyCapUsd.toFixed(2)} incluidos</>}
            {monthlyCapUsd != null && (
              <>
                {" "}
                — al llegar al cupo, el bot responde con un mensaje fijo hasta el mes siguiente.
              </>
            )}
          </p>
        </div>
        <div className="border-t pt-4">
          <ConnectForm
            currentModel={settings?.model}
            currentSystemPrompt={settings?.systemPrompt ?? undefined}
            currentOffTopicReply={settings?.offTopicReply ?? undefined}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Herramientas MCP</h2>
        <p className="text-xs text-muted-foreground">
          Servidores MCP externos que el agente puede usar como herramientas al responder.
        </p>
        <McpServerList servers={mcpServers} />
        <div className="border-t pt-4">
          <h3 className="mb-3 text-sm font-medium">Añadir Nuevo</h3>
          <McpServerForm />
        </div>
      </section>
    </div>
  );
}
