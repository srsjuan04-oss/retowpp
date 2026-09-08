import { describe, expect, test } from "bun:test";
import { isBusinessScopedUserId } from "./bsuid";

describe("isBusinessScopedUserId", () => {
  test("reconoce un BSUID típico", () => {
    expect(isBusinessScopedUserId("CO.2278535082987351")).toBe(true);
    expect(isBusinessScopedUserId("US.13491208655302741918")).toBe(true);
  });

  test("un wa_id real (solo dígitos) no es un BSUID", () => {
    expect(isBusinessScopedUserId("573137439004")).toBe(false);
  });

  test("rechaza formatos que no calzan", () => {
    expect(isBusinessScopedUserId("CO-2278535082987351")).toBe(false);
    expect(isBusinessScopedUserId("2278535082987351")).toBe(false);
    expect(isBusinessScopedUserId("")).toBe(false);
  });
});
