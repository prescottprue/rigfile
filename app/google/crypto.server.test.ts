import { beforeAll, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./crypto.server";

beforeAll(() => {
  // 32 bytes of base64 — the encryption key the helper expects.
  process.env.GOOGLE_TOKEN_KEY = btoa("0123456789abcdef0123456789abcdef");
});

describe("token encryption", () => {
  it("round-trips a secret", async () => {
    const secret = "1//refresh-token-value-abc.def_ghi";
    const encrypted = await encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(await decryptSecret(encrypted)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const a = await encryptSecret("same");
    const b = await encryptSecret("same");
    expect(a).not.toBe(b);
    expect(await decryptSecret(a)).toBe("same");
    expect(await decryptSecret(b)).toBe("same");
  });

  it("rejects a malformed payload", async () => {
    await expect(decryptSecret("not-valid")).rejects.toThrow();
  });

  it("fails when the key length is wrong", async () => {
    const original = process.env.GOOGLE_TOKEN_KEY;
    process.env.GOOGLE_TOKEN_KEY = btoa("too-short");
    await expect(encryptSecret("x")).rejects.toThrow(/32 bytes/);
    process.env.GOOGLE_TOKEN_KEY = original;
  });
});
