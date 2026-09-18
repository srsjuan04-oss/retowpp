import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Traduce los códigos de error más comunes de Postgres a un mensaje en español
 * que un usuario puede entender, en vez de reenviarle el mensaje crudo de la
 * base de datos (ej. `duplicate key value violates unique constraint
 * "flows_name_key"`). Cuando el código no es uno de los conocidos, cae al
 * mensaje original de Postgrest — sigue siendo mejor que nada.
 */
export function friendlyDbError(error: PostgrestError): string {
  switch (error.code) {
    case "23505":
      return "Ya existe un registro con ese mismo valor.";
    case "23503":
      return "La operación hace referencia a un registro que no existe o ya fue eliminado.";
    case "23502":
      return "Falta un campo obligatorio.";
    case "22P02":
      return "Uno de los valores enviados no tiene el formato esperado.";
    case "23514":
      return "El valor enviado no cumple una condición requerida.";
    default:
      return error.message;
  }
}
