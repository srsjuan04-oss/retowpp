/**
 * Payload que envía salon-pro (el CRM) al recordar una cita. A diferencia de
 * Hotmart, no hay que "extraerlo" de un formato externo: ya llega limpio,
 * con los nombres de campo que usa `resolveAppointmentReminderVariables`.
 */
export interface AppointmentReminderPayload {
  phone: string;
  customerName: string | null;
  serviceName: string | null;
  barberName: string | null;
  time: string | null;
}

const APPT_FIELD_RE = /\{\{appt\.(\w+)\}\}/g;

/**
 * Resuelve el `variable_mapping` de una receta de recordatorio (índice de
 * plantilla -> texto con referencias `{{appt.campo}}`) contra el payload de un
 * evento concreto. Mismo patrón que `resolveHotmartVariables`, namespace `appt`.
 */
export function resolveAppointmentReminderVariables(
  mapping: Record<string, string>,
  data: AppointmentReminderPayload,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [index, template] of Object.entries(mapping)) {
    resolved[index] = template.replace(APPT_FIELD_RE, (_match, field: string) => {
      switch (field) {
        case "customer_name":
          return data.customerName ?? "";
        case "service_name":
          return data.serviceName ?? "";
        case "barber_name":
          return data.barberName ?? "";
        case "time":
          return data.time ?? "";
        default:
          return "";
      }
    });
  }
  return resolved;
}
