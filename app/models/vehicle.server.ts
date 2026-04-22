import { and, desc, eq } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { NewVehicle, Vehicle } from "~/db/schema";
import { vehicles } from "~/db/schema";

export type { Vehicle };

export async function getVehicle({
  id,
  userId,
}: Pick<Vehicle, "id" | "userId">) {
  const db = await getDb();
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)));
  return vehicle ?? null;
}

export async function getVehicleListItems({ userId }: Pick<Vehicle, "userId">) {
  const db = await getDb();
  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.userId, userId))
    .orderBy(desc(vehicles.updatedAt));
}

export async function createVehicle(input: NewVehicle) {
  const db = await getDb();
  const [vehicle] = await db.insert(vehicles).values(input).returning();
  if (!vehicle) throw new Error("Failed to create vehicle");
  return vehicle;
}

export async function deleteVehicle({
  id,
  userId,
}: Pick<Vehicle, "id" | "userId">) {
  const db = await getDb();
  return db
    .delete(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)));
}
