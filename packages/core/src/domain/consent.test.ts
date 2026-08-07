import { describe, expect, test } from "bun:test";
import { assertCanContact } from "./consent";

describe("assertCanContact", () => {
  test("permite contactar a un suscrito", () => {
    expect(assertCanContact("subscribed").allowed).toBe(true);
  });

  test("permite contactar a un pendiente (aún no ha dado ni retirado consentimiento)", () => {
    expect(assertCanContact("pending").allowed).toBe(true);
  });

  test("bloquea a quien se dio de baja", () => {
    const result = assertCanContact("unsubscribed");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test("bloquea a quien está en la lista de exclusión", () => {
    const result = assertCanContact("blocked");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
