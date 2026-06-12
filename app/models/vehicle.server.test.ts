import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users, vehicleMembers } from "~/db/schema";
import { createVehicle, updateVehicle } from "~/models/vehicle.server";

// Integration test — requires DATABASE_URL pointing at a running local
// Postgres with migrations applied.

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL is required for vehicle.server.test.ts");

const { db, close } = createDb(url);

let ownerId: string;
let memberId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(users)
    .values({ email: `veh-owner-${Date.now()}@example.com` })
    .returning();
  if (!owner) throw new Error("owner insert failed");
  ownerId = owner.id;
  const [member] = await db
    .insert(users)
    .values({ email: `veh-member-${Date.now()}@example.com` })
    .returning();
  if (!member) throw new Error("member insert failed");
  memberId = member.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, memberId));
  await close();
});

describe("updateVehicle", () => {
  it("updates fields and normalizes the VIN", async () => {
    const vehicle = await createVehicle({
      userId: ownerId,
      make: "Jeep",
      model: "Wrangler",
      year: 2024,
    });
    const updated = await updateVehicle({
      id: vehicle.id,
      userId: ownerId,
      name: "Rally Rig",
      make: "Jeep",
      model: "Wrangler",
      trim: "Rubicon",
      year: 2024,
      vin: " 1c4hjxdg5jw000000 ",
      engine: "3.6L V6 Pentastar",
    });
    expect(updated.name).toBe("Rally Rig");
    expect(updated.trim).toBe("Rubicon");
    expect(updated.vin).toBe("1C4HJXDG5JW000000");
    expect(updated.engine).toBe("3.6L V6 Pentastar");
    // avatarPath untouched when not provided
    expect(updated.avatarPath).toBeNull();
  });

  it("rejects non-owners (members included)", async () => {
    const vehicle = await createVehicle({
      userId: ownerId,
      make: "Jeep",
      model: "Wrangler",
      year: 2024,
    });
    await db
      .insert(vehicleMembers)
      .values({ vehicleId: vehicle.id, userId: memberId, role: "member" });
    await expect(
      updateVehicle({
        id: vehicle.id,
        userId: memberId,
        name: null,
        make: "Honda",
        model: "Civic",
        trim: null,
        year: 2020,
        vin: null,
        engine: null,
      }),
    ).rejects.toThrow("Only the owner");
  });

  it("replaces the avatar path only when provided", async () => {
    const vehicle = await createVehicle({
      userId: ownerId,
      make: "Jeep",
      model: "Wrangler",
      year: 2024,
      avatarPath: "vehicle-avatars/x/old",
    });
    const updated = await updateVehicle({
      id: vehicle.id,
      userId: ownerId,
      name: null,
      make: "Jeep",
      model: "Wrangler",
      trim: null,
      year: 2024,
      vin: null,
      engine: null,
      avatarPath: "vehicle-avatars/x/new",
    });
    expect(updated.avatarPath).toBe("vehicle-avatars/x/new");
  });
});
