import { describe, expect, test } from "bun:test";
import { normalizeWaId } from "./phone";

describe("normalizeWaId", () => {
  test("acepta un número con formato E.164 y quita el '+'", () => {
    expect(normalizeWaId("+52 155 1234 5678")).toBe("5215512345678");
  });

  test("acepta un número sin separadores", () => {
    expect(normalizeWaId("5215512345678")).toBe("5215512345678");
  });

  test("rechaza un número demasiado corto", () => {
    expect(normalizeWaId("12345")).toBeNull();
  });

  test("rechaza texto sin dígitos suficientes", () => {
    expect(normalizeWaId("no es un teléfono")).toBeNull();
  });
});
