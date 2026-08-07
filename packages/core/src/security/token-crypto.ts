import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  // scrypt con salt fijo derivado del propio secreto: determinístico entre
  // procesos (web y worker) sin necesitar almacenar un salt aparte. La
  // fortaleza real depende de WABA_TOKEN_ENCRYPTION_KEY siendo un secreto
  // de alta entropía (32+ bytes aleatorios), no de este salt.
  return scryptSync(secret, "reto-whatsapp-waba-token", 32);
}

/** Cifra el access token de un WABA antes de guardarlo en `waba_accounts.access_token_encrypted`. */
export function encryptWabaToken(plainToken: string, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/** Descifra el access token para usarlo en una llamada al Graph API. Solo debe correr server-side. */
export function decryptWabaToken(encryptedToken: string, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const raw = Buffer.from(encryptedToken, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
