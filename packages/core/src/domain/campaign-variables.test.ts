import { describe, expect, test } from "bun:test";
import { resolveCampaignVariables } from "./campaign-variables";

describe("resolveCampaignVariables", () => {
  test("sustituye {{contact.display_name}} por el nombre del contacto", () => {
    const result = resolveCampaignVariables(
      { "1": "Hola {{contact.display_name}}" },
      { displayName: "María", waId: "5215512345678", customFields: {} },
    );
    expect(result["1"]).toBe("Hola María");
  });

  test("usa cadena vacía si el contacto no tiene nombre", () => {
    const result = resolveCampaignVariables(
      { "1": "Hola {{contact.display_name}}" },
      { displayName: null, waId: "5215512345678", customFields: {} },
    );
    expect(result["1"]).toBe("Hola ");
  });

  test("sustituye un campo personalizado por su clave", () => {
    const result = resolveCampaignVariables(
      { "1": "Tu plan es {{contact.plan}}" },
      { displayName: "Ana", waId: "521", customFields: { plan: "Premium" } },
    );
    expect(result["1"]).toBe("Tu plan es Premium");
  });

  test("un valor literal sin placeholders se deja tal cual", () => {
    const result = resolveCampaignVariables({ "1": "10% de descuento" }, { displayName: null, waId: "521", customFields: {} });
    expect(result["1"]).toBe("10% de descuento");
  });
});
