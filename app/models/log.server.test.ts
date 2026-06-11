import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users } from "~/db/schema";
import { createLog, searchLogs } from "~/models/log.server";
import { createVehicle } from "~/models/vehicle.server";

// Integration test — requires DATABASE_URL pointing at a running local Postgres
// with migrations applied. Run via: node --env-file=.env npm test

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for log.server.test.ts");

const { db, close } = createDb(url);

let userId: string;
let vehicleId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `search-test-${Date.now()}@example.com` })
    .returning();
  if (!user) throw new Error("user insert failed");
  userId = user.id;

  // createVehicle (not a raw insert) so the owner membership row exists —
  // log access is granted via vehicle_members.
  const vehicle = await createVehicle({
    userId,
    make: "Test",
    model: "Vehicle",
    year: 2020,
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  // Cascade deletes memberships + logs + vehicles
  await db.delete(users).where(eq(users.id, userId));
  await close();
});

describe("searchLogs", () => {
  it("matches logs by keywords in title and notes", async () => {
    await createLog({
      userId,
      vehicleId,
      title: "Replaced brake pads",
      notes: "Fronts were at 2mm",
    });
    await createLog({
      userId,
      vehicleId,
      title: "Oil change",
      notes: "Synthetic 5W-30",
    });

    const brakeResults = await searchLogs({ userId, query: "brake" });
    expect(brakeResults).toHaveLength(1);
    expect(brakeResults[0]?.title).toBe("Replaced brake pads");

    const oilResults = await searchLogs({ userId, query: "synthetic" });
    expect(oilResults).toHaveLength(1);
    expect(oilResults[0]?.title).toBe("Oil change");

    const noResults = await searchLogs({ userId, query: "transmission" });
    expect(noResults).toHaveLength(0);

    const emptyResults = await searchLogs({ userId, query: "   " });
    expect(emptyResults).toHaveLength(0);
  });

  it("does not leak results across users", async () => {
    const [otherUser] = await db
      .insert(users)
      .values({ email: `search-other-${Date.now()}@example.com` })
      .returning();
    if (!otherUser) throw new Error("other user insert failed");
    try {
      const otherVehicle = await createVehicle({
        userId: otherUser.id,
        make: "Other",
        model: "Vehicle",
        year: 2020,
      });
      await createLog({
        userId: otherUser.id,
        vehicleId: otherVehicle.id,
        title: "Secret brake job",
      });
      const results = await searchLogs({ userId, query: "secret" });
      expect(results).toHaveLength(0);
    } finally {
      await db.delete(users).where(eq(users.id, otherUser.id));
    }
  });

  it("rejects log access on vehicles the user is not a member of", async () => {
    const [stranger] = await db
      .insert(users)
      .values({ email: `stranger-${Date.now()}@example.com` })
      .returning();
    if (!stranger) throw new Error("stranger insert failed");
    try {
      await expect(
        createLog({ userId: stranger.id, vehicleId, title: "Drive-by log" }),
      ).rejects.toThrow("Vehicle not found");
    } finally {
      await db.delete(users).where(eq(users.id, stranger.id));
    }
  });
});
