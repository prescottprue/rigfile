import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Build a Drizzle client from a Postgres URL. Caller owns the connection
 * lifecycle. Callers on Workers should create a new client per request —
 * Hyperdrive pools the underlying TCP connection so this is cheap.
 */
export function createDb(connectionString: string): {
  db: DrizzleClient;
  close: () => Promise<void>;
} {
  const client = postgres(connectionString, {
    // Hyperdrive + serverless Postgres use transaction pooling, which
    // disallows prepared statements.
    prepare: false,
  });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

async function resolveConnectionString(): Promise<string> {
  // On Cloudflare Workers the Hyperdrive binding exposes a pooled URL.
  // Fall back to the raw DATABASE_URL on Node self-host (and in vitest).
  // The module specifier is built at runtime so Vite/vitest doesn't try to
  // statically resolve `cloudflare:workers` on Node.
  const cfModuleId = "cloudflare" + ":workers";
  try {
    // biome-ignore lint/suspicious/noExplicitAny: cross-runtime env shape
    const cf: any = await import(/* @vite-ignore */ cfModuleId).catch(
      () => null,
    );
    const hd = cf?.env?.HYPERDRIVE as { connectionString?: string } | undefined;
    if (hd?.connectionString) return hd.connectionString;
  } catch {
    // not running on Workers
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

// Single Node self-host client, kept across requests inside the same process.
// On Workers each request resolves Hyperdrive fresh (below), which is the
// pattern Cloudflare recommends.
let _nodeSingleton: { db: DrizzleClient; close: () => Promise<void> } | null =
  null;

export async function getDb(): Promise<DrizzleClient> {
  const url = await resolveConnectionString();

  // Hyperdrive URLs carry a short-lived proxy host that may change across
  // requests; always make a fresh client when we have one. The URL pattern
  // `<hex>.hyperdrive.local` is miniflare's dev shape; production hostnames
  // also always start with a generated identifier.
  if (url.includes("hyperdrive")) {
    return createDb(url).db;
  }

  if (!_nodeSingleton) {
    _nodeSingleton = createDb(url);
  }
  return _nodeSingleton.db;
}
