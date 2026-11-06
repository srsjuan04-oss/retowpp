import { describe, expect, test } from "bun:test";
import { findUnknownCampaignPlaceholders, resolveCampaignVariables } from "./campaign-variables";

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

describe("findUnknownCampaignPlaceholders", () => {
  test("acepta display_name, wa_id y campos personalizados conocidos", () => {
    expect(
      findUnknownCampaignPlaceholders(
        { "1": "Hola {{contact.display_name}}", "2": "{{contact.wa_id}}", "3": "{{contact.ciudad}}", "4": "Texto fijo" },
        ["ciudad"],
      ),
    ).toEqual([]);
  });

  test("rechaza variables de Hotmart y campos inexistentes", () => {
    expect(
      findUnknownCampaignPlaceholders(
        { "1": "{{hotmart.buyer_first_name}}", "2": "{{contact.no_existe}}", "3": "{{1}}" },
        [],
      ),
    ).toEqual(["{{hotmart.buyer_first_name}}", "{{contact.no_existe}}", "{{1}}"]);
  });
});
