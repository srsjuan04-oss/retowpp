import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyMetaWebhookSignature } from "./signature";

const APP_SECRET = "test-app-secret";

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyMetaWebhookSignature", () => {
  test("acepta una firma válida calculada con el mismo secreto", () => {
    const body = JSON.stringify({ hello: "world" });
    const valid = verifyMetaWebhookSignature({
      rawBody: body,
      signatureHeader: sign(body),
      appSecret: APP_SECRET,
    });
    expect(valid).toBe(true);
  });

  test("rechaza una firma calculada con un secreto distinto", () => {
    const body = JSON.stringify({ hello: "world" });
    const valid = verifyMetaWebhookSignature({
      rawBody: body,
      signatureHeader: sign(body, "otro-secreto"),
      appSecret: APP_SECRET,
    });
    expect(valid).toBe(false);
  });

  test("rechaza si el body fue alterado después de firmar", () => {
    const original = JSON.stringify({ amount: 10 });
    const tampered = JSON.stringify({ amount: 1000 });
    const valid = verifyMetaWebhookSignature({
      rawBody: tampered,
      signatureHeader: sign(original),
      appSecret: APP_SECRET,
    });
    expect(valid).toBe(false);
  });

  test("rechaza si falta el header de firma", () => {
    const valid = verifyMetaWebhookSignature({
      rawBody: "{}",
      signatureHeader: null,
      appSecret: APP_SECRET,
    });
    expect(valid).toBe(false);
  });

  test("rechaza un header sin el prefijo sha256=", () => {
    const valid = verifyMetaWebhookSignature({
      rawBody: "{}",
      signatureHeader: "abcdef",
      appSecret: APP_SECRET,
    });
    expect(valid).toBe(false);
  });
});
