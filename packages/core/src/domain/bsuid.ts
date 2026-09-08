/**
 * BSUID (Business-Scoped User ID): identidad que Meta manda en el webhook en vez del wa_id/phone
 * cuando el contacto escribió sin compartir su número (rollout de usernames de WhatsApp, 2026).
 * Formato "<código de país ISO 3166-1 alpha-2>.<alfanumérico>", ej. "CO.2278535082987351".
 * Nunca colisiona con un wa_id real: un wa_id siempre son solo dígitos.
 */
const BSUID_RE = /^[A-Za-z]{2}\.[A-Za-z0-9]+$/;

export function isBusinessScopedUserId(id: string): boolean {
  return BSUID_RE.test(id);
}
