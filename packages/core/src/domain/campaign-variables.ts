export interface CampaignVariableContact {
  displayName: string | null;
  waId: string;
  customFields: Record<string, unknown>;
}

const CONTACT_FIELD_RE = /\{\{contact\.(\w+)\}\}/g;

/**
 * Resuelve el mapeo de variables de una campaña (definido una vez al crearla)
 * en valores concretos por destinatario, sustituyendo referencias como
 * `{{contact.display_name}}` o `{{contact.algun_campo_personalizado}}`.
 * El resto del texto se usa literal.
 */
export function resolveCampaignVariables(
  mapping: Record<string, string>,
  contact: CampaignVariableContact,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [index, template] of Object.entries(mapping)) {
    resolved[index] = template.replace(CONTACT_FIELD_RE, (_match, field: string) => {
      if (field === "display_name") return contact.displayName ?? "";
      if (field === "wa_id") return contact.waId;
      const value = contact.customFields[field];
      return value === undefined || value === null ? "" : String(value);
    });
  }
  return resolved;
}

const ANY_PLACEHOLDER_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * Devuelve los `{{…}}` del mapeo que la campaña no sabría resolver. Sin esta
 * validación se enviaban literales como `{{hotmart.buyer_first_name}}` (esas
 * variables solo existen en el complemento de Hotmart, no en campañas).
 */
export function findUnknownCampaignPlaceholders(
  mapping: Record<string, string>,
  knownCustomFieldKeys: Iterable<string>,
): string[] {
  const known = new Set(["display_name", "wa_id", ...knownCustomFieldKeys]);
  const unknown = new Set<string>();
  for (const template of Object.values(mapping)) {
    for (const [raw, inner] of template.matchAll(ANY_PLACEHOLDER_RE)) {
      const field = /^contact\.(\w+)$/.exec(inner ?? "")?.[1];
      if (!field || !known.has(field)) unknown.add(raw);
    }
  }
  return [...unknown];
}
