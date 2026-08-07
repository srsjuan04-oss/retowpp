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
