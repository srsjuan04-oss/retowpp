export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

const STATUS_RANK: Record<MessageStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 99,
};

/**
 * Los webhooks de estado de Meta pueden llegar duplicados o desordenados.
 * Un evento de estado nunca debe hacer retroceder el estado ya registrado de
 * un mensaje (p. ej. un "sent" tardío no debe pisar un "read" ya recibido).
 * `failed` es terminal pero se acepta desde cualquier estado previo.
 */
export function isForwardStatusTransition(current: MessageStatus, next: MessageStatus): boolean {
  if (next === "failed") return true;
  if (current === "failed") return false;
  return STATUS_RANK[next] > STATUS_RANK[current];
}
