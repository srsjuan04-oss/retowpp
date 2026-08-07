import { describe, expect, test } from "bun:test";
import { extractPlaceholderIndexes, renderTemplateComponents, type StoredTemplateComponent } from "./templates";

describe("extractPlaceholderIndexes", () => {
  test("extrae índices únicos y ordenados", () => {
    expect(extractPlaceholderIndexes("Hola {{1}}, tu pedido {{2}} llega el {{1}}")).toEqual([1, 2]);
  });

  test("arreglo vacío si no hay placeholders", () => {
    expect(extractPlaceholderIndexes("Sin variables aquí")).toEqual([]);
  });

  test("arreglo vacío para texto indefinido", () => {
    expect(extractPlaceholderIndexes(undefined)).toEqual([]);
  });
});

describe("renderTemplateComponents", () => {
  // Meta numera las variables en orden secuencial de aparición ({{1}}, {{2}}, {{3}}...);
  // el array `parameters` que exige el Graph API sigue ese mismo orden posicional.
  const components: StoredTemplateComponent[] = [
    { type: "HEADER", format: "TEXT", text: "Pedido {{1}}" },
    { type: "BODY", text: "Hola {{2}}, tu pedido {{1}} fue enviado el {{3}}." },
    { type: "FOOTER", text: "Gracias por tu compra" },
  ];

  test("renderiza header y body cuando todas las variables están presentes", () => {
    const { components: rendered, missingVariables } = renderTemplateComponents(components, {
      "1": "A100",
      "2": "Juan",
      "3": "2026-07-27",
    });

    expect(missingVariables).toEqual([]);
    expect(rendered).toEqual([
      { type: "header", parameters: [{ type: "text", text: "A100" }] },
      {
        type: "body",
        // Orden por índice ascendente (1,2,3), no por orden de aparición en el texto.
        parameters: [
          { type: "text", text: "A100" },
          { type: "text", text: "Juan" },
          { type: "text", text: "2026-07-27" },
        ],
      },
    ]);
  });

  test("reporta las variables faltantes sin lanzar y no envía nunca al Graph API con huecos", () => {
    const { missingVariables } = renderTemplateComponents(components, { "1": "A100" });
    expect(missingVariables).toEqual([2, 3]);
  });

  test("una plantilla sin variables no agrega components vacíos", () => {
    const noVarsComponents: StoredTemplateComponent[] = [{ type: "BODY", text: "Gracias por tu compra." }];
    const { components: rendered, missingVariables } = renderTemplateComponents(noVarsComponents, {});
    expect(rendered).toEqual([]);
    expect(missingVariables).toEqual([]);
  });
});
