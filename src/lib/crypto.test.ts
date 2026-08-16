import { beforeAll, describe, expect, it } from "vitest";

const KEY = "0123456789abcdef0123456789abcdef"; // 32 chars

beforeAll(() => {
  process.env.ENCRYPTION_KEY = KEY;
});

async function loadCrypto() {
  return import("./crypto");
}

describe("crypto", () => {
  it("round-trips a value and tags it with the enc:v1: prefix", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const secret = "shpat_super_secret_token_value";
    const ciphertext = encrypt(secret);

    expect(ciphertext.startsWith("enc:v1:")).toBe(true);
    expect(ciphertext).not.toContain(secret);
    expect(decrypt(ciphertext)).toBe(secret);
  });

  it("returns genuine legacy plaintext tokens unchanged", async () => {
    const { decrypt } = await loadCrypto();
    expect(decrypt("shpat_plain_legacy_token")).toBe("shpat_plain_legacy_token");
  });

  it("still decrypts legacy (unprefixed) ciphertext", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const secret = "legacy_offline_token";
    const legacy = encrypt(secret).slice("enc:v1:".length); // strip prefix

    expect(legacy.startsWith("enc:v1:")).toBe(false);
    expect(decrypt(legacy)).toBe(secret);
  });

  it("throws on a tampered enc:v1: payload instead of returning ciphertext", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const ciphertext = encrypt("value");
    const tampered = ciphertext.slice(0, -4) + "AAAA";

    expect(() => decrypt(tampered)).toThrow();
  });
});
