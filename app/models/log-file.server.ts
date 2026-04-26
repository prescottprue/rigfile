import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { LogFile, NewLogFile } from "~/db/schema";
import { logFiles, logs } from "~/db/schema";

export type { LogFile };

export async function getLogFiles({
  logId,
  userId,
  vehicleId,
}: {
  logId: string;
  userId: string;
  vehicleId: string;
}) {
  const db = await getDb();
  return db
    .select({
      id: logFiles.id,
      logId: logFiles.logId,
      userId: logFiles.userId,
      filePath: logFiles.filePath,
      fileName: logFiles.fileName,
      contentType: logFiles.contentType,
      fileSize: logFiles.fileSize,
      category: logFiles.category,
      description: logFiles.description,
      createdAt: logFiles.createdAt,
      updatedAt: logFiles.updatedAt,
    })
    .from(logFiles)
    .innerJoin(logs, eq(logFiles.logId, logs.id))
    .where(
      and(
        eq(logFiles.logId, logId),
        eq(logs.userId, userId),
        eq(logs.vehicleId, vehicleId),
      ),
    );
}

export async function createLogFile(input: NewLogFile) {
  const db = await getDb();
  const [file] = await db.insert(logFiles).values(input).returning();
  if (!file) throw new Error("Failed to create log file");
  return file;
}

export async function deleteLogFile({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  const db = await getDb();
  const [deleted] = await db
    .delete(logFiles)
    .where(and(eq(logFiles.id, id), eq(logFiles.userId, userId)))
    .returning({ filePath: logFiles.filePath });
  return deleted ?? null;
}

export async function getLogFilesByLogId({
  logId,
  userId,
}: {
  logId: string;
  userId: string;
}) {
  const db = await getDb();
  return db
    .select({ filePath: logFiles.filePath })
    .from(logFiles)
    .where(and(eq(logFiles.logId, logId), eq(logFiles.userId, userId)));
}

export async function getLogFileCountsByLogIds({
  logIds,
  userId,
}: {
  logIds: string[];
  userId: string;
}) {
  if (logIds.length === 0) return {};
  const db = await getDb();
  const rows = await db
    .select({
      logId: logFiles.logId,
      count: sql<number>`count(*)::int`,
    })
    .from(logFiles)
    .where(and(eq(logFiles.userId, userId), inArray(logFiles.logId, logIds)))
    .groupBy(logFiles.logId);
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.logId] = row.count;
  }
  return map;
}
