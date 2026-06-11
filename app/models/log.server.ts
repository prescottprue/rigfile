import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { Log, NewLog } from "~/db/schema";
import { logs, mechanics, users, vehicleMembers } from "~/db/schema";
import { deleteAttachmentBlobsForLogs } from "~/models/attachment.server";
import { requireVehicleAccess } from "~/models/member.server";
import type { Storage } from "~/storage.server";

export type { Log };

export type LogListItem = Log & {
  authorName: string | null;
  /** Vendor (mechanics table) name, when the log is linked to a shop. */
  mechanicName: string | null;
};

/**
 * `userId` here is the requesting user — access is granted via crew
 * membership on the vehicle, not log authorship.
 */
export async function getLog({
  id,
  userId,
  vehicleId,
}: Pick<Log, "id" | "userId" | "vehicleId">): Promise<LogListItem | null> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [row] = await db
    .select({
      log: logs,
      authorName: sql<
        string | null
      >`coalesce(${users.displayName}, ${users.email})`,
      mechanicName: mechanics.name,
    })
    .from(logs)
    .leftJoin(users, eq(users.id, logs.userId))
    .leftJoin(mechanics, eq(mechanics.id, logs.mechanicId))
    .where(and(eq(logs.id, id), eq(logs.vehicleId, vehicleId)));
  if (!row) return null;
  return {
    ...row.log,
    authorName: row.authorName,
    mechanicName: row.mechanicName,
  };
}

export async function getLogListItems({
  userId,
  vehicleId,
  limit,
}: Pick<Log, "userId" | "vehicleId"> & {
  limit?: number;
}): Promise<LogListItem[]> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const query = db
    .select({
      log: logs,
      authorName: sql<
        string | null
      >`coalesce(${users.displayName}, ${users.email})`,
      mechanicName: mechanics.name,
    })
    .from(logs)
    .leftJoin(users, eq(users.id, logs.userId))
    .leftJoin(mechanics, eq(mechanics.id, logs.mechanicId))
    .where(eq(logs.vehicleId, vehicleId))
    .orderBy(desc(logs.servicedAt), desc(logs.createdAt));
  const rows = await (limit != null ? query.limit(limit) : query);
  return rows.map((r) => ({
    ...r.log,
    authorName: r.authorName,
    mechanicName: r.mechanicName,
  }));
}

/** Highest odometer ever logged for the vehicle (best guess at current). */
export async function getLatestOdometer({
  vehicleId,
}: Pick<Log, "vehicleId">): Promise<number | null> {
  const db = await getDb();
  const [row] = await db
    .select({ latest: sql<number | null>`max(${logs.odometer})` })
    .from(logs)
    .where(eq(logs.vehicleId, vehicleId));
  return row?.latest ?? null;
}

export async function createLog(input: NewLog) {
  await requireVehicleAccess({
    vehicleId: input.vehicleId,
    userId: input.userId,
  });
  const db = await getDb();
  const [log] = await db.insert(logs).values(input).returning();
  if (!log) throw new Error("Failed to create log");
  return log;
}

export async function deleteLog({
  id,
  userId,
  vehicleId,
  storage,
}: Pick<Log, "id" | "userId" | "vehicleId"> & {
  /** Override the storage driver (tests). */
  storage?: Storage;
}) {
  await requireVehicleAccess({ vehicleId, userId });
  // Reap stored attachment bytes first — the row cascade only removes the
  // DB side, and once the log row is gone the paths are unreachable.
  await deleteAttachmentBlobsForLogs({
    logIds: [id],
    ...(storage ? { storage } : {}),
  });
  const db = await getDb();
  return db
    .delete(logs)
    .where(and(eq(logs.id, id), eq(logs.vehicleId, vehicleId)));
}

/**
 * Full-text search over logs on every vehicle the user can access, using
 * the generated `search_tsv` column + GIN index.
 */
export async function searchLogs({
  userId,
  query,
}: {
  userId: Log["userId"];
  query: string;
}): Promise<Log[]> {
  const db = await getDb();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const rows = await db
    .select({ log: logs })
    .from(logs)
    .innerJoin(
      vehicleMembers,
      and(
        eq(vehicleMembers.vehicleId, logs.vehicleId),
        eq(vehicleMembers.userId, userId),
      ),
    )
    .where(sql`${logs.searchTsv} @@ plainto_tsquery('english', ${trimmed})`)
    .orderBy(desc(logs.updatedAt));
  return rows.map((r) => r.log);
}
