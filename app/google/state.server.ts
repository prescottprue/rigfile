/**
 * Signed, stateless OAuth `state` parameter for the Google connect flow.
 *
 * The state is an HMAC-SHA256 token (keyed by SESSION_SECRET) carrying the
 * logged-in user's id, a nonce, and an issue time. The callback verifies the
 * signature, freshness, and that the embedded user matches the current
 * session — so a forged or replayed callback can't bind a Drive account to the
 * wrong user. Keeping it stateless avoids writing a one-shot value to the
 * session cookie from a raw route handler.
 */

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes to complete consent.

function secretBytes(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secretBytes() as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(payload: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(payload) as BufferSource,
  );
  return base64UrlEncode(new Uint8Array(sig));
}

export async function createState(userId: string): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ u: userId, t: Date.now(), n: crypto.randomUUID() }),
    ),
  );
  return `${payload}.${await sign(payload)}`;
}

export async function verifyState(
  state: string | null,
  userId: string,
): Promise<boolean> {
  if (!state) return false;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return false;
  if (!timingSafeEqual(sig, await sign(payload))) return false;
  try {
    const data = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload)),
    ) as { u?: string; t?: number };
    if (data.u !== userId) return false;
    if (typeof data.t !== "number" || Date.now() - data.t > MAX_AGE_MS) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
