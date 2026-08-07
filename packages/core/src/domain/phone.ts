/**
 * Normaliza un número de teléfono a la forma `wa_id` que usa WhatsApp Cloud
 * API: solo dígitos, con código de país, sin "+" ni separadores. Devuelve
 * null si no parece un número E.164 válido (7 a 15 dígitos).
 */
export function normalizeWaId(rawPhone: string): string | null {
  const digitsOnly = rawPhone.replace(/[^\d]/g, "");
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return null;
  return digitsOnly;
}
