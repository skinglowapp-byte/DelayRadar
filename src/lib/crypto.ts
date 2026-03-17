import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    return null;
  }

  // Accept either a 32-byte hex string (64 chars) or a raw 32-char string.
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const buf = Buffer.from(raw, "utf-8");

  if (buf.length < 32) {
    return null;
  }

  return buf.subarray(0, 32);
}

/**
 * Encrypt a plaintext string. Returns a base64-encoded payload that
 * bundles IV + ciphertext + auth tag so a single DB column is enough.
 * Returns the plaintext unchanged if ENCRYPTION_KEY is not configured.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();

  if (!key) {
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Layout: iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt a value previously produced by `encrypt()`. If the value
 * does not look like an encrypted payload (e.g. a legacy plaintext
 * token) it is returned as-is for backwards compatibility.
 */
export function decrypt(value: string): string {
  const key = getEncryptionKey();

  if (!key) {
    return value;
  }

  // Heuristic: encrypted payloads are base64 and at least IV+TAG long.
  let buf: Buffer;

  try {
    buf = Buffer.from(value, "base64");
  } catch {
    return value;
  }

  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    // Too short to be an encrypted payload — treat as legacy plaintext.
    return value;
  }

  try {
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf-8");
  } catch {
    // Decryption failed — the value is likely a legacy plaintext token.
    return value;
  }
}
