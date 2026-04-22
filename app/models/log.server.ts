import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { Log, NewLog } from "~/db/schema";
import { logs } from "~/db/schema";

export type { Log };

export async function getLog({
  id,
  userId,
  vehicleId,
}: Pick<Log, "id" | "userId" | "vehicleId">) {
  const db = getDb();
  const [log] = await db
    .select()
    .from(logs)
    .where(
      and(
        eq(logs.id, id),
        eq(logs.userId, userId),
        eq(logs.vehicleId, vehicleId),
      ),
    );
  return log ?? null;
}

export async function getLogListItems({
  userId,
  vehicleId,
}: Pick<Log, "userId" | "vehicleId">) {
  const db = getDb();
  return db
    .select()
    .from(logs)
    .where(and(eq(logs.userId, userId), eq(logs.vehicleId, vehicleId)))
    .orderBy(desc(logs.updatedAt));
}

export async function createLog(input: NewLog) {
  const db = getDb();
  const [log] = await db.insert(logs).values(input).returning();
  if (!log) throw new Error("Failed to create log");
  return log;
}

export async function deleteLog({
  id,
  userId,
  vehicleId,
}: Pick<Log, "id" | "userId" | "vehicleId">) {
  const db = getDb();
  return db
    .delete(logs)
    .where(
      and(
        eq(logs.id, id),
        eq(logs.userId, userId),
        eq(logs.vehicleId, vehicleId),
      ),
    );
}

/**
 * Full-text search over a user's logs using the generated `search_tsv` column
 * + GIN index. Returns logs ordered by updatedAt desc.
 */
export async function searchLogs({
  userId,
  query,
}: {
  userId: Log["userId"];
  query: string;
}): Promise<Log[]> {
  const db = getDb();
  const trimmed = query.trim();
  if (!trimmed) return [];

  return db
    .select()
    .from(logs)
    .where(
      and(
        eq(logs.userId, userId),
        sql`${logs.searchTsv} @@ plainto_tsquery('english', ${trimmed})`,
      ),
    )
    .orderBy(desc(logs.updatedAt));
}
