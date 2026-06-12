import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { OdometerReading } from "~/db/schema";
import { logs, odometerReadings, users } from "~/db/schema";
import { requireVehicleAccess } from "~/models/member.server";

export type { OdometerReading };

export type LatestOdometer = {
  odometer: number;
  /** servicedAt for log-sourced readings, readAt for manual ones. */
  date: Date;
  source: "log" | "reading";
  /** Set when the reading came from a work log. */
  logId: string | null;
};

function isLater(a: LatestOdometer, b: LatestOdometer): boolean {
  if (a.date.getTime() !== b.date.getTime()) {
    return a.date.getTime() > b.date.getTime();
  }
  return a.odometer > b.odometer;
}

/**
 * Latest reading per vehicle across work logs and manual readings — most
 * recent by date, same-date ties broken by higher miles. Deliberately NOT
 * max(miles): a typo'd entry can be deleted to roll the value back, while
 * max() could never go down. No access check — internal helper; callers
 * either check membership themselves or pass server-derived vehicle ids.
 */
export async function getLatestOdometerByVehicle({
  vehicleIds,
}: {
  vehicleIds: string[];
}): Promise<Map<string, LatestOdometer>> {
  const result = new Map<string, LatestOdometer>();
  if (vehicleIds.length === 0) return result;
  const db = await getDb();

  const logRows = await db
    .selectDistinctOn([logs.vehicleId], {
      vehicleId: logs.vehicleId,
      odometer: logs.odometer,
      date: logs.servicedAt,
      logId: logs.id,
    })
    .from(logs)
    .where(and(inArray(logs.vehicleId, vehicleIds), isNotNull(logs.odometer)))
    .orderBy(logs.vehicleId, desc(logs.servicedAt), desc(logs.odometer));

  const readingRows = await db
    .selectDistinctOn([odometerReadings.vehicleId], {
      vehicleId: odometerReadings.vehicleId,
      odometer: odometerReadings.odometer,
      date: odometerReadings.readAt,
    })
    .from(odometerReadings)
    .where(inArray(odometerReadings.vehicleId, vehicleIds))
    .orderBy(
      odometerReadings.vehicleId,
      desc(odometerReadings.readAt),
      desc(odometerReadings.odometer),
    );

  for (const r of logRows) {
    if (r.odometer == null) continue;
    result.set(r.vehicleId, {
      odometer: r.odometer,
      date: r.date,
      source: "log",
      logId: r.logId,
    });
  }
  for (const r of readingRows) {
    const candidate: LatestOdometer = {
      odometer: r.odometer,
      date: r.date,
      source: "reading",
      logId: null,
    };
    const existing = result.get(r.vehicleId);
    if (!existing || isLater(candidate, existing)) {
      result.set(r.vehicleId, candidate);
    }
  }
  return result;
}

export async function getLatestOdometer({
  vehicleId,
}: {
  vehicleId: string;
}): Promise<LatestOdometer | null> {
  const byVehicle = await getLatestOdometerByVehicle({
    vehicleIds: [vehicleId],
  });
  return byVehicle.get(vehicleId) ?? null;
}

export type OdometerHistoryEntry = {
  odometer: number;
  date: Date;
  source: "log" | "reading";
  logId: string | null;
  logTitle: string | null;
  readingId: string | null;
  note: string | null;
  authorName: string | null;
  authorUserId: string | null;
};

/** Full reading history, newest first (ties: higher miles first). */
export async function listOdometerHistory({
  vehicleId,
  userId,
}: {
  vehicleId: string;
  userId: string;
}): Promise<OdometerHistoryEntry[]> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();

  const logRows = await db
    .select({
      odometer: logs.odometer,
      date: logs.servicedAt,
      logId: logs.id,
      logTitle: logs.title,
    })
    .from(logs)
    .where(and(eq(logs.vehicleId, vehicleId), isNotNull(logs.odometer)));

  const readingRows = await db
    .select({
      odometer: odometerReadings.odometer,
      date: odometerReadings.readAt,
      readingId: odometerReadings.id,
      note: odometerReadings.note,
      authorUserId: odometerReadings.userId,
      authorName: sql<
        string | null
      >`coalesce(${users.displayName}, ${users.email})`,
    })
    .from(odometerReadings)
    .leftJoin(users, eq(users.id, odometerReadings.userId))
    .where(eq(odometerReadings.vehicleId, vehicleId));

  const entries: OdometerHistoryEntry[] = [
    ...logRows.map((r) => ({
      // isNotNull() in the WHERE guarantees this; Drizzle can't narrow it.
      odometer: r.odometer as number,
      date: r.date,
      source: "log" as const,
      logId: r.logId,
      logTitle: r.logTitle,
      readingId: null,
      note: null,
      authorName: null,
      authorUserId: null,
    })),
    ...readingRows.map((r) => ({
      odometer: r.odometer,
      date: r.date,
      source: "reading" as const,
      logId: null,
      logTitle: null,
      readingId: r.readingId,
      note: r.note,
      authorName: r.authorName,
      authorUserId: r.authorUserId,
    })),
  ];
  return entries.sort(
    (a, b) => b.date.getTime() - a.date.getTime() || b.odometer - a.odometer,
  );
}

export async function createOdometerReading({
  vehicleId,
  userId,
  odometer,
  readAt,
  note,
}: {
  vehicleId: string;
  userId: string;
  odometer: number;
  readAt?: Date | null;
  note?: string | null;
}): Promise<OdometerReading> {
  await requireVehicleAccess({ vehicleId, userId });
  if (!Number.isFinite(odometer) || odometer <= 0) {
    throw new Error("Odometer must be a positive number");
  }
  const db = await getDb();
  const [reading] = await db
    .insert(odometerReadings)
    .values({
      vehicleId,
      userId,
      odometer,
      note: note?.trim() || null,
      ...(readAt ? { readAt } : {}),
    })
    .returning();
  if (!reading) throw new Error("Failed to save reading");
  return reading;
}

/**
 * Manual readings only — log-sourced values are corrected on the log
 * itself. The reading's author or the vehicle owner may delete.
 */
export async function deleteOdometerReading({
  id,
  vehicleId,
  userId,
}: {
  id: string;
  vehicleId: string;
  userId: string;
}): Promise<void> {
  const role = await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [reading] = await db
    .select()
    .from(odometerReadings)
    .where(
      and(
        eq(odometerReadings.id, id),
        eq(odometerReadings.vehicleId, vehicleId),
      ),
    );
  if (!reading) throw new Error("Reading not found");
  if (reading.userId !== userId && role !== "owner") {
    throw new Error("Only the author or the owner can delete a reading");
  }
  await db.delete(odometerReadings).where(eq(odometerReadings.id, id));
}
