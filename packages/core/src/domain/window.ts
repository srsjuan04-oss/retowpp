export const CUSTOMER_SERVICE_WINDOW_HOURS = 24;

/**
 * Meta solo permite mensajes de sesión (texto libre, multimedia libre) dentro de las
 * 24h siguientes al último mensaje entrante del contacto. Fuera de esa ventana,
 * únicamente se pueden enviar mensajes de plantilla aprobados.
 */
export function isWithinServiceWindow(lastInboundAt: Date | string | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const last = typeof lastInboundAt === "string" ? new Date(lastInboundAt) : lastInboundAt;
  const elapsedMs = now.getTime() - last.getTime();
  return elapsedMs <= CUSTOMER_SERVICE_WINDOW_HOURS * 60 * 60 * 1000;
}

export type OutboundMessageKind = "template" | "session";

export interface WindowCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Punto único de aplicación de la regla de ventana de 24h. Debe invocarse tanto en el
 * envío manual de agentes como en el despachador de campañas: nunca solo en la UI.
 */
export function assertCanSendOutbound(params: {
  kind: OutboundMessageKind;
  lastInboundAt: Date | string | null;
  now?: Date;
}): WindowCheckResult {
  if (params.kind === "template") return { allowed: true };
  const withinWindow = isWithinServiceWindow(params.lastInboundAt, params.now);
  if (!withinWindow) {
    return {
      allowed: false,
      reason: "Fuera de la ventana de atención de 24h: solo se permiten mensajes de plantilla aprobados.",
    };
  }
  return { allowed: true };
}
