import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { NewVehicle, Vehicle } from "~/db/schema";
import { logs, reminders, vehicleMembers, vehicles } from "~/db/schema";
import type { VehicleRole } from "~/models/member.server";

export type { Vehicle };

export type VehicleWithRole = Vehicle & { role: VehicleRole };

/**
 * Fetch a vehicle the user can access (owner or crew member), along with
 * their role. Returns null when the vehicle doesn't exist or isn't shared
 * with them — callers can't tell the difference, by design.
 */
export async function getVehicle({
  id,
  userId,
}: Pick<Vehicle, "id" | "userId">): Promise<VehicleWithRole | null> {
  const db = await getDb();
  const [row] = await db
    .select({ vehicle: vehicles, role: vehicleMembers.role })
    .from(vehicles)
    .innerJoin(
      vehicleMembers,
      and(
        eq(vehicleMembers.vehicleId, vehicles.id),
        eq(vehicleMembers.userId, userId),
      ),
    )
    .where(eq(vehicles.id, id));
  if (!row) return null;
  return { ...row.vehicle, role: row.role as VehicleRole };
}

export type VehicleListItem = VehicleWithRole & {
  latestOdometer: number | null;
  overdueCount: number;
  dueSoonCount: number;
};

const DUE_SOON_DAYS = 30;
const DUE_SOON_MILES = 500;

/**
 * All vehicles the user owns or crews on, with the latest logged odometer
 * and reminder alert counts for the list view badges.
 */
export async function getVehicleListItems({
  userId,
}: Pick<Vehicle, "userId">): Promise<VehicleListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ vehicle: vehicles, role: vehicleMembers.role })
    .from(vehicles)
    .innerJoin(
      vehicleMembers,
      and(
        eq(vehicleMembers.vehicleId, vehicles.id),
        eq(vehicleMembers.userId, userId),
      ),
    )
    .where(eq(vehicleMembers.userId, userId))
    .orderBy(desc(vehicles.updatedAt));
  if (rows.length === 0) return [];

  const vehicleIds = rows.map((r) => r.vehicle.id);

  const odoRows = await db
    .select({
      vehicleId: logs.vehicleId,
      latestOdometer: sql<number | null>`max(${logs.odometer})`,
    })
    .from(logs)
    .where(inArray(logs.vehicleId, vehicleIds))
    .groupBy(logs.vehicleId);
  const odoByVehicle = new Map(
    odoRows.map((r) => [r.vehicleId, r.latestOdometer]),
  );

  const reminderRows = await db
    .select()
    .from(reminders)
    .where(
      and(
        inArray(reminders.vehicleId, vehicleIds),
        isNull(reminders.completedAt),
      ),
    );

  const now = Date.now();
  const soonCutoff = now + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;
  const alerts = new Map<string, { overdue: number; dueSoon: number }>();
  for (const r of reminderRows) {
    const odo = odoByVehicle.get(r.vehicleId) ?? null;
    const overdue =
      (r.dueDate != null && r.dueDate.getTime() <= now) ||
      (r.dueMiles != null && odo != null && odo >= r.dueMiles);
    const dueSoon =
      !overdue &&
      ((r.dueDate != null && r.dueDate.getTime() <= soonCutoff) ||
        (r.dueMiles != null &&
          odo != null &&
          odo >= r.dueMiles - DUE_SOON_MILES));
    const entry = alerts.get(r.vehicleId) ?? { overdue: 0, dueSoon: 0 };
    if (overdue) entry.overdue += 1;
    if (dueSoon) entry.dueSoon += 1;
    alerts.set(r.vehicleId, entry);
  }

  return rows.map(({ vehicle, role }) => ({
    ...vehicle,
    role: role as VehicleRole,
    latestOdometer: odoByVehicle.get(vehicle.id) ?? null,
    overdueCount: alerts.get(vehicle.id)?.overdue ?? 0,
    dueSoonCount: alerts.get(vehicle.id)?.dueSoon ?? 0,
  }));
}

export async function createVehicle(input: NewVehicle) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [vehicle] = await tx.insert(vehicles).values(input).returning();
    if (!vehicle) throw new Error("Failed to create vehicle");
    await tx.insert(vehicleMembers).values({
      vehicleId: vehicle.id,
      userId: vehicle.userId,
      role: "owner",
    });
    return vehicle;
  });
}

/** Owner only — `userId` must match the vehicle's owner column. */
export async function deleteVehicle({
  id,
  userId,
}: Pick<Vehicle, "id" | "userId">) {
  const db = await getDb();
  return db
    .delete(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)));
}
