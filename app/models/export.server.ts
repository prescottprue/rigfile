import { eq, inArray } from "drizzle-orm";

import { getDb } from "~/db/client";
import {
  logs,
  logsToParts,
  logsToTags,
  mechanics,
  odometerReadings,
  parts,
  tags,
  users,
  vehicleDocuments,
  vehicles,
} from "~/db/schema";

/**
 * Build the full "your data" export bundle for a user — every vehicle, log,
 * reading, vendor, tag, part, and document they own. Shared by the
 * `/account/export` download endpoint and the Google Drive sync, so the JSON
 * written to Drive is byte-for-byte the same as the manual download. Returns
 * null when the user no longer exists.
 */
export async function buildUserExport(userId: string) {
  const db = await getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return null;

  const [userVehicles, userLogs] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.userId, userId)),
    db.select().from(logs).where(eq(logs.userId, userId)),
  ]);

  const logIds = userLogs.map((l) => l.id);
  const vehicleIds = userVehicles.map((v) => v.id);
  const mechanicIds = Array.from(
    new Set(
      userLogs.map((l) => l.mechanicId).filter((id): id is string => !!id),
    ),
  );

  const [tagJoins, partJoins, mechanicRows, readingRows, documentRows] =
    await Promise.all([
      logIds.length
        ? db.select().from(logsToTags).where(inArray(logsToTags.logId, logIds))
        : Promise.resolve([]),
      logIds.length
        ? db
            .select()
            .from(logsToParts)
            .where(inArray(logsToParts.logId, logIds))
        : Promise.resolve([]),
      mechanicIds.length
        ? db.select().from(mechanics).where(inArray(mechanics.id, mechanicIds))
        : Promise.resolve([]),
      vehicleIds.length
        ? db
            .select()
            .from(odometerReadings)
            .where(inArray(odometerReadings.vehicleId, vehicleIds))
        : Promise.resolve([]),
      vehicleIds.length
        ? db
            .select()
            .from(vehicleDocuments)
            .where(inArray(vehicleDocuments.vehicleId, vehicleIds))
        : Promise.resolve([]),
    ]);

  const tagIds = Array.from(new Set(tagJoins.map((j) => j.tagId)));
  const partIds = Array.from(new Set(partJoins.map((j) => j.partId)));

  const [tagRows, partRows] = await Promise.all([
    tagIds.length
      ? db.select().from(tags).where(inArray(tags.id, tagIds))
      : Promise.resolve([]),
    partIds.length
      ? db.select().from(parts).where(inArray(parts.id, partIds))
      : Promise.resolve([]),
  ]);

  return {
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    user,
    vehicles: userVehicles.map((v) => ({
      ...v,
      avatarUrl: v.avatarPath ? `/files/${v.avatarPath}` : null,
    })),
    logs: userLogs,
    odometerReadings: readingRows,
    vehicleDocuments: documentRows.map((d) => ({
      ...d,
      fileUrl: `/files/${d.path}`,
    })),
    mechanics: mechanicRows,
    tags: tagRows,
    parts: partRows,
    logsToTags: tagJoins,
    logsToParts: partJoins,
  };
}
