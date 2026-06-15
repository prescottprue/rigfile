/**
 * AES-GCM encryption for secrets at rest — used to protect Google refresh
 * tokens before they're written to Postgres. WebCrypto (`globalThis.crypto`)
 * is available on both Cloudflare Workers and Node 24, so this stays
 * runtime-agnostic like the rest of the app.
 *
 * The key comes from the GOOGLE_TOKEN_KEY env var: 32 random bytes encoded as
 * base64 (generate with `openssl rand -base64 32`). Ciphertext is stored as
 * `base64(iv).base64(ciphertext+tag)` so a stored value is self-describing.
 */

const IV_BYTES = 12; // 96-bit nonce, the AES-GCM standard.

function getKeyMaterial(): Uint8Array {
  const raw = process.env.GOOGLE_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_TOKEN_KEY is required to encrypt Google Drive tokens",
    );
  }
  const bytes = base64ToBytes(raw.trim());
  if (bytes.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_KEY must decode to 32 bytes (generate with `openssl rand -base64 32`)",
    );
  }
  return bytes;
}

async function importKey(usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getKeyMaterial() as BufferSource,
    { name: "AES-GCM" },
    false,
    [usage],
  );
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await importKey("encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ct))}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  const [ivPart, ctPart] = stored.split(".");
  if (!ivPart || !ctPart) {
    throw new Error("Malformed encrypted secret");
  }
  const key = await importKey("decrypt");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivPart) as BufferSource },
    key,
    base64ToBytes(ctPart) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
