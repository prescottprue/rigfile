import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Build a Drizzle client from a Postgres URL.
 *
 * On Cloudflare Workers the URL comes from the Hyperdrive binding
 * (`env.HYPERDRIVE.connectionString`); on Node it comes from `DATABASE_URL`.
 * The caller owns the connection lifecycle so we don't leak pools.
 */
export function createDb(connectionString: string): {
  db: DrizzleClient;
  close: () => Promise<void>;
} {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    // Workers runtime has no long-lived sockets — Hyperdrive handles pooling.
    prepare: false,
  });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

/**
 * Process-wide singleton for Node self-host. Safe for CF Workers too as long as
 * callers pass the Hyperdrive URL explicitly in an env-aware wrapper.
 */
let _singleton: { db: DrizzleClient; close: () => Promise<void> } | undefined;

export function getDb(): DrizzleClient {
  if (!_singleton) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required");
    }
    _singleton = createDb(url);
  }
  return _singleton.db;
}
