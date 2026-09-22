/**
 * Cliente MCP mínimo (Streamable HTTP, JSON-RPC) para las pocas herramientas que el worker
 * ejecuta por su cuenta en vez de dejárselas al conector MCP de Anthropic — hoy solo
 * `log_customer_note`, para poder agregarle el costo real de Claude al resumen.
 */

export interface McpServerConnection {
  name: string;
  url: string;
  authorizationToken?: string;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS_CACHE_TTL_MS = 10 * 60 * 1000;
const toolsCache = new Map<string, { expiresAt: number; tools: McpToolDefinition[] }>();

let requestId = 0;

async function rpc(server: McpServerConnection, method: string, params?: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(server.authorizationToken ? { authorization: `Bearer ${server.authorizationToken}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, ...(params ? { params } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`MCP ${server.name} respondió ${response.status} a ${method}`);

  // El servidor puede contestar JSON plano o un stream SSE con el mensaje en líneas `data:`.
  const text = await response.text();
  const payload = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .at(-1)
    : text;
  if (!payload) throw new Error(`MCP ${server.name} no devolvió respuesta a ${method}`);

  const message = JSON.parse(payload) as { result?: unknown; error?: { message?: string } };
  if (message.error) throw new Error(`MCP ${server.name}: ${message.error.message ?? "error desconocido"}`);
  return message.result;
}

/** Lista las herramientas del servidor, cacheadas unos minutos para no sumar latencia a cada mensaje. */
export async function listMcpTools(server: McpServerConnection): Promise<McpToolDefinition[]> {
  const cached = toolsCache.get(server.url);
  if (cached && cached.expiresAt > Date.now()) return cached.tools;

  const result = (await rpc(server, "tools/list")) as { tools?: McpToolDefinition[] };
  const tools = result.tools ?? [];
  toolsCache.set(server.url, { expiresAt: Date.now() + TOOLS_CACHE_TTL_MS, tools });
  return tools;
}

/** Ejecuta una herramienta y devuelve su salida como texto, más si el servidor la marcó como error. */
export async function callMcpTool(
  server: McpServerConnection,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const result = (await rpc(server, "tools/call", { name, arguments: args })) as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = (result.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
  return { text: text || "(sin contenido)", isError: result.isError === true };
}
