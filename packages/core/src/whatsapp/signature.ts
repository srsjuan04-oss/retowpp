import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica la firma X-Hub-Signature-256 de un webhook de Meta.
 * Debe ejecutarse sobre el body crudo (raw string/Buffer), no sobre el JSON re-serializado,
 * porque cualquier diferencia de formato invalida el HMAC.
 */
export function verifyMetaWebhookSignature(params: {
  rawBody: string | Buffer;
  signatureHeader: string | null;
  appSecret: string;
}): boolean {
  const { rawBody, signatureHeader, appSecret } = params;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expectedHex = signatureHeader.slice("sha256=".length);
  const computedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  const computed = Buffer.from(computedHex, "hex");
  if (expected.length !== computed.length) return false;

  return timingSafeEqual(expected, computed);
}
