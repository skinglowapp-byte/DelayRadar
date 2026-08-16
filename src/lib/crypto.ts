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
 * Throws if ENCRYPTION_KEY is missing or too short. Call this at the start of
 * any flow that is about to persist a secret so a misconfigured deploy fails
 * loudly instead of silently storing plaintext.
 */
export function assertEncryptionKey(): void {
  if (!getEncryptionKey()) {
    throw new Error(
      "ENCRYPTION_KEY is not configured (need a 32-byte hex string or 32+ char secret). Refusing to store secrets in plaintext.",
    );
  }
}

const ENCRYPTED_PREFIX = "enc:v1:";

/**
 * Encrypt a plaintext string. Returns a base64-encoded payload (prefixed with
 * `enc:v1:`) that bundles IV + ciphertext + auth tag so a single DB column is
 * enough. In production a missing key throws; in dev/test it returns the
 * plaintext unchanged for convenience.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      assertEncryptionKey();
    }
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Layout: enc:v1: + base64(iv (12) + tag (16) + ciphertext)
  return ENCRYPTED_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptBuffer(buf: Buffer, key: Buffer): string {
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf-8");
}

/**
 * Decrypt a value previously produced by `encrypt()`.
 *
 * - `enc:v1:`-prefixed values are unambiguously ours: a decryption failure
 *   THROWS so a corrupt payload / rotated key surfaces loudly instead of
 *   silently returning ciphertext that Shopify would later reject as a 401.
 * - Legacy values (pre-prefix): tokens encrypted before the prefix existed are
 *   still valid AES-GCM payloads, so we attempt to decrypt them; genuine
 *   plaintext tokens (e.g. `shpat_...`) that aren't valid ciphertext are
 *   returned unchanged.
 */
export function decrypt(value: string): string {
  const key = getEncryptionKey();

  if (value.startsWith(ENCRYPTED_PREFIX)) {
    if (!key) {
      throw new Error(
        "Encountered an encrypted value but ENCRYPTION_KEY is not configured.",
      );
    }

    const buf = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64");

    if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
      throw new Error("Encrypted value is malformed (too short).");
    }

    return decryptBuffer(buf, key);
  }

  // Legacy path: no prefix. Without a key we can't decrypt, so assume plaintext.
  if (!key) {
    return value;
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(value, "base64");
  } catch {
    return value;
  }

  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    return value;
  }

  try {
    return decryptBuffer(buf, key);
  } catch {
    // Not a valid legacy ciphertext — treat as genuine plaintext token.
    return value;
  }
}
