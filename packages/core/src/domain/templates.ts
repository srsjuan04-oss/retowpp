import type { WhatsAppTemplateComponent } from "../whatsapp/types";

export interface StoredTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
  text?: string;
  buttons?: Array<{ type: string; text: string }>;
}

const PLACEHOLDER_RE = /\{\{(\d+)\}\}/g;

export function extractPlaceholderIndexes(text: string | undefined): number[] {
  if (!text) return [];
  const indexes = new Set<number>();
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const raw = match[1];
    if (raw) indexes.add(Number(raw));
  }
  return [...indexes].sort((a, b) => a - b);
}

export interface RenderTemplateResult {
  components: WhatsAppTemplateComponent[];
  missingVariables: number[];
}

/**
 * Construye el arreglo `components` que exige el endpoint de envío de plantillas de Meta,
 * a partir de la definición de la plantilla (sincronizada desde Meta) y los valores de
 * variables capturados en el módulo de campañas/envío. Valida que no falte ningún índice
 * requerido por el body/header antes de intentar el envío.
 */
export function renderTemplateComponents(
  storedComponents: StoredTemplateComponent[],
  variableValues: Record<string, string>,
): RenderTemplateResult {
  const components: WhatsAppTemplateComponent[] = [];
  const missingVariables: number[] = [];

  for (const component of storedComponents) {
    if (component.type === "BODY" && component.text) {
      const indexes = extractPlaceholderIndexes(component.text);
      if (indexes.length === 0) continue;
      const parameters = indexes.map((index) => {
        const value = variableValues[String(index)];
        if (value === undefined) missingVariables.push(index);
        return { type: "text" as const, text: value ?? "" };
      });
      components.push({ type: "body", parameters });
    }

    if (component.type === "HEADER" && component.format === "TEXT" && component.text) {
      const indexes = extractPlaceholderIndexes(component.text);
      if (indexes.length === 0) continue;
      const parameters = indexes.map((index) => {
        const value = variableValues[String(index)];
        if (value === undefined) missingVariables.push(index);
        return { type: "text" as const, text: value ?? "" };
      });
      components.push({ type: "header", parameters });
    }
  }

  return { components, missingVariables: [...new Set(missingVariables)] };
}
