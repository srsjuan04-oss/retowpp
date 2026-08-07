import { createHash } from "node:crypto";

/**
 * Clave de deduplicación del webhook crudo: hash del body exacto recibido.
 * Cubre el caso de que Meta reintente la misma entrega (mismo body) porque
 * no confirmamos a tiempo. La deduplicación por mensaje individual (wamid)
 * ocurre después, en la etapa de procesamiento, vía constraint único en `messages`.
 */
export function buildWebhookDedupeKey(rawBody: string | Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/**
 * jobId determinístico para BullMQ: reintentar o reencolar el mismo (campaign_id, contact_id)
 * nunca produce un segundo job activo, y sirve además como segunda capa de idempotencia
 * junto al constraint único (campaign_id, contact_id) en campaign_recipients.
 * Separador "|" (no ":"): BullMQ reserva jobIds con ":" para jobs repetibles y exige que
 * tengan exactamente 3 partes, o lanza "Custom Id cannot contain :" al encolar.
 */
export function buildCampaignSendJobId(campaignId: string, contactId: string): string {
  return `${campaignId}|${contactId}`;
}

/**
 * Clave de deduplicación para el evento de estado de un mensaje (sent/delivered/read/failed).
 * Incluye el timestamp de Meta para no colapsar transiciones de estado legítimas,
 * pero sí colapsar reentregas exactas del mismo evento.
 */
export function buildMessageStatusDedupeKey(wamid: string, status: string, timestamp: string): string {
  return `${wamid}:${status}:${timestamp}`;
}
