export type ConsentStatus = "subscribed" | "unsubscribed" | "blocked" | "pending";

export interface ConsentCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Punto único de aplicación de consentimiento. Debe consultarse antes de:
 * materializar campaign_recipients, enviar un mensaje de campaña individual,
 * y enviar un mensaje manual desde la bandeja.
 */
export function assertCanContact(consentStatus: ConsentStatus): ConsentCheckResult {
  if (consentStatus === "unsubscribed") {
    return { allowed: false, reason: "El contacto se dio de baja (unsubscribed)." };
  }
  if (consentStatus === "blocked") {
    return { allowed: false, reason: "El contacto está bloqueado en la lista de exclusión." };
  }
  return { allowed: true };
}
