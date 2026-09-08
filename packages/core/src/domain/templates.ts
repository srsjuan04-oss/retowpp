import type { CreateTemplateComponent, WhatsAppTemplateComponent } from "../whatsapp/types";

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

/** Nombre de plantilla exigido por Meta: solo minúsculas, dígitos y guion bajo. */
export const TEMPLATE_NAME_RE = /^[a-z0-9_]+$/;

export interface TemplateButtonDraft {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url?: string;
}

export interface TemplateDraft {
  headerText?: string;
  headerExamples?: string[];
  bodyText: string;
  bodyExamples?: string[];
  footerText?: string;
  buttons?: TemplateButtonDraft[];
}

export interface BuildTemplateComponentsResult {
  components: CreateTemplateComponent[];
  error?: string;
}

/**
 * Arma el arreglo `components` que exige POST /{waba-id}/message_templates a partir de lo
 * capturado en el formulario de creación. Meta exige un `example` por cada variable
 * {{n}} en header/body (si falta, rechaza la creación con un error poco claro), así que
 * se valida acá antes de intentar la llamada.
 */
export function buildTemplateComponents(draft: TemplateDraft): BuildTemplateComponentsResult {
  const components: CreateTemplateComponent[] = [];

  const headerText = draft.headerText?.trim();
  if (headerText) {
    const indexes = extractPlaceholderIndexes(headerText);
    if (indexes.length > 0) {
      const examples = (draft.headerExamples ?? []).slice(0, indexes.length);
      if (examples.length < indexes.length || examples.some((e) => !e.trim())) {
        return { components: [], error: "Falta un ejemplo para cada variable del encabezado." };
      }
      components.push({ type: "HEADER", format: "TEXT", text: headerText, example: { header_text: examples } });
    } else {
      components.push({ type: "HEADER", format: "TEXT", text: headerText });
    }
  }

  const bodyText = draft.bodyText.trim();
  const bodyIndexes = extractPlaceholderIndexes(bodyText);
  if (bodyIndexes.length > 0) {
    const examples = (draft.bodyExamples ?? []).slice(0, bodyIndexes.length);
    if (examples.length < bodyIndexes.length || examples.some((e) => !e.trim())) {
      return { components: [], error: "Falta un ejemplo para cada variable del cuerpo." };
    }
    components.push({ type: "BODY", text: bodyText, example: { body_text: [examples] } });
  } else {
    components.push({ type: "BODY", text: bodyText });
  }

  const footerText = draft.footerText?.trim();
  if (footerText) components.push({ type: "FOOTER", text: footerText });

  const buttons = (draft.buttons ?? []).filter((b) => b.text.trim());
  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.map((b) =>
        b.type === "URL"
          ? { type: "URL" as const, text: b.text.trim(), url: (b.url ?? "").trim() }
          : { type: "QUICK_REPLY" as const, text: b.text.trim() },
      ),
    });
  }

  return { components };
}
