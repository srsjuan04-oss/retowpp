import { requireRole } from "@/lib/auth/dal";
import { getAiAgentSettings, listMcpServers } from "@/lib/ai-agent/queries";
import { Badge } from "@/components/ui/badge";
import { ConnectForm } from "./connect-form";
import { AgentToggle } from "./agent-toggle";
import { McpServerForm } from "./mcp-server-form";
import { McpServerList } from "./mcp-server-list";

export default async function AiAgentSettingsPage() {
  await requireRole("admin");
  const [settings, mcpServers] = await Promise.all([getAiAgentSettings(), listMcpServers()]);

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <h1 className="text-xl font-semibold">Asistente de IA</h1>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium">Conexión con Claude</h2>
          <Badge variant={settings ? "success" : "neutral"}>{settings ? "conectado" : "sin conectar"}</Badge>
        </div>
        <ConnectForm currentModel={settings?.model} currentSystemPrompt={settings?.systemPrompt ?? undefined} isConnected={!!settings} />
        {settings && (
          <div className="border-t pt-4">
            <AgentToggle isEnabled={settings.isEnabled} />
            <p className="mt-2 text-xs text-muted-foreground">
              {settings.isEnabled
                ? "El bot está activo: responderá automáticamente a los mensajes entrantes."
                : "El bot está inactivo: los mensajes entrantes no reciben respuesta automática."}
            </p>
          </div>
        )}
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
