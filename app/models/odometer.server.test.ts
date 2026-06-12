import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users, vehicleMembers } from "~/db/schema";
import { createLog } from "~/models/log.server";
import {
  createOdometerReading,
  deleteOdometerReading,
  getLatestOdometer,
  listOdometerHistory,
} from "~/models/odometer.server";
import {
  completeReminder,
  createReminder,
  listReminders,
} from "~/models/reminder.server";
import { createVehicle } from "~/models/vehicle.server";

// Integration test — requires DATABASE_URL pointing at a running local
// Postgres with migrations applied.

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL is required for odometer.server.test.ts");

const { db, close } = createDb(url);

let ownerId: string;
let memberId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(users)
    .values({ email: `odo-owner-${Date.now()}@example.com` })
    .returning();
  if (!owner) throw new Error("owner insert failed");
  ownerId = owner.id;

  const [member] = await db
    .insert(users)
    .values({ email: `odo-member-${Date.now()}@example.com` })
    .returning();
  if (!member) throw new Error("member insert failed");
  memberId = member.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, memberId));
  await close();
});

/** Fresh vehicle per test so latest/history assertions don't interfere. */
async function makeVehicle() {
  const vehicle = await createVehicle({
    userId: ownerId,
    make: "Jeep",
    model: "Wrangler",
    year: 2024,
  });
  await db
    .insert(vehicleMembers)
    .values({ vehicleId: vehicle.id, userId: memberId, role: "member" });
  return vehicle.id;
}

describe("getLatestOdometer", () => {
  it("returns null when there are no readings at all", async () => {
    const vehicleId = await makeVehicle();
    expect(await getLatestOdometer({ vehicleId })).toBeNull();
  });

  it("returns the latest log odometer with its service date", async () => {
    const vehicleId = await makeVehicle();
    await createLog({
      userId: ownerId,
      vehicleId,
      title: "Old service",
      odometer: 50_000,
      servicedAt: new Date("2025-01-15"),
    });
    const log = await createLog({
      userId: ownerId,
      vehicleId,
      title: "New service",
      odometer: 55_000,
      servicedAt: new Date("2026-03-01"),
    });
    const latest = await getLatestOdometer({ vehicleId });
    expect(latest).toMatchObject({
      odometer: 55_000,
      source: "log",
      logId: log.id,
    });
    expect(latest?.date.toISOString()).toBe(
      new Date("2026-03-01").toISOString(),
    );
  });

  it("prefers the most recent date across logs and manual readings", async () => {
    const vehicleId = await makeVehicle();
    // Log has HIGHER miles but an OLDER date — latest-by-date must win.
    await createLog({
      userId: ownerId,
      vehicleId,
      title: "Service",
      odometer: 60_000,
      servicedAt: new Date("2026-01-01"),
    });
    await createOdometerReading({
      vehicleId,
      userId: ownerId,
      odometer: 59_000, // corrected reading, newer date
      readAt: new Date("2026-05-01"),
    });
    const latest = await getLatestOdometer({ vehicleId });
    expect(latest).toMatchObject({
      odometer: 59_000,
      source: "reading",
      logId: null,
    });
  });

  it("breaks same-date ties by higher miles", async () => {
    const vehicleId = await makeVehicle();
    const date = new Date("2026-04-01");
    await createLog({
      userId: ownerId,
      vehicleId,
      title: "Service",
      odometer: 61_000,
      servicedAt: date,
    });
    await createOdometerReading({
      vehicleId,
      userId: ownerId,
      odometer: 61_250,
      readAt: date,
    });
    const latest = await getLatestOdometer({ vehicleId });
    expect(latest?.odometer).toBe(61_250);
    expect(latest?.source).toBe("reading");
  });
});

describe("createOdometerReading", () => {
  it("rejects non-members", async () => {
    const vehicleId = await makeVehicle();
    const [stranger] = await db
      .insert(users)
      .values({ email: `odo-stranger-${Date.now()}@example.com` })
      .returning();
    if (!stranger) throw new Error("stranger insert failed");
    try {
      await expect(
        createOdometerReading({
          vehicleId,
          userId: stranger.id,
          odometer: 1000,
        }),
      ).rejects.toThrow("Vehicle not found");
    } finally {
      await db.delete(users).where(eq(users.id, stranger.id));
    }
  });

  it("rejects non-positive and non-finite miles", async () => {
    const vehicleId = await makeVehicle();
    await expect(
      createOdometerReading({ vehicleId, userId: ownerId, odometer: 0 }),
    ).rejects.toThrow("positive");
    await expect(
      createOdometerReading({ vehicleId, userId: ownerId, odometer: NaN }),
    ).rejects.toThrow("positive");
  });

  it("lets a crew member add a reading with note and date", async () => {
    const vehicleId = await makeVehicle();
    const reading = await createOdometerReading({
      vehicleId,
      userId: memberId,
      odometer: 62_000,
      readAt: new Date("2026-06-01"),
      note: "Spotted at the trailhead",
    });
    expect(reading.odometer).toBe(62_000);
    expect(reading.note).toBe("Spotted at the trailhead");
    expect(reading.userId).toBe(memberId);
  });
});

describe("deleteOdometerReading", () => {
  it("allows the author and the owner, rejects other members", async () => {
    const vehicleId = await makeVehicle();
    const byMember = await createOdometerReading({
      vehicleId,
      userId: memberId,
      odometer: 63_000,
    });
    const byOwner = await createOdometerReading({
      vehicleId,
      userId: ownerId,
      odometer: 63_100,
    });

    // A member may not delete someone else's reading.
    await expect(
      deleteOdometerReading({
        id: byOwner.id,
        vehicleId,
        userId: memberId,
      }),
    ).rejects.toThrow("author or the owner");

    // The author may delete their own.
    await deleteOdometerReading({
      id: byMember.id,
      vehicleId,
      userId: memberId,
    });
    // The owner may delete anyone's.
    await deleteOdometerReading({ id: byOwner.id, vehicleId, userId: ownerId });

    expect(await getLatestOdometer({ vehicleId })).toBeNull();
  });
});

describe("listOdometerHistory", () => {
  it("merges both sources newest-first with source metadata", async () => {
    const vehicleId = await makeVehicle();
    const log = await createLog({
      userId: ownerId,
      vehicleId,
      title: "Oil change",
      odometer: 58_000,
      servicedAt: new Date("2026-02-01"),
    });
    await createOdometerReading({
      vehicleId,
      userId: memberId,
      odometer: 59_500,
      readAt: new Date("2026-05-15"),
      note: "dash check",
    });

    const history = await listOdometerHistory({ vehicleId, userId: memberId });
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      source: "reading",
      odometer: 59_500,
      note: "dash check",
      authorUserId: memberId,
    });
    expect(history[1]).toMatchObject({
      source: "log",
      odometer: 58_000,
      logId: log.id,
      logTitle: "Oil change",
    });
  });

  it("rejects non-members", async () => {
    const vehicleId = await makeVehicle();
    const [stranger] = await db
      .insert(users)
      .values({ email: `odo-stranger2-${Date.now()}@example.com` })
      .returning();
    if (!stranger) throw new Error("stranger insert failed");
    try {
      await expect(
        listOdometerHistory({ vehicleId, userId: stranger.id }),
      ).rejects.toThrow("Vehicle not found");
    } finally {
      await db.delete(users).where(eq(users.id, stranger.id));
    }
  });
});

describe("reminders use the union latest", () => {
  it("a manual reading newer than any log drives due-miles status", async () => {
    const vehicleId = await makeVehicle();
    await createReminder({
      userId: ownerId,
      vehicleId,
      title: "Oil change",
      dueMiles: 65_000,
    });
    await createLog({
      userId: ownerId,
      vehicleId,
      title: "Service",
      odometer: 60_000,
      servicedAt: new Date("2026-01-01"),
    });
    // 64,800 manual reading → 200 miles left → due_soon (threshold 500).
    await createOdometerReading({
      vehicleId,
      userId: ownerId,
      odometer: 64_800,
      readAt: new Date("2026-06-01"),
    });
    const reminders = await listReminders({ vehicleId, userId: ownerId });
    const oil = reminders.find((r) => r.title === "Oil change");
    expect(oil?.milesLeft).toBe(200);
    expect(oil?.status).toBe("due_soon");
  });

  it("completeReminder without an explicit odometer rolls forward from the union latest", async () => {
    const vehicleId = await makeVehicle();
    const reminder = await createReminder({
      userId: ownerId,
      vehicleId,
      title: "Rotate tires",
      dueMiles: 61_000,
      intervalMiles: 5_000,
    });
    // Older log with HIGHER miles vs newer manual reading with LOWER miles —
    // the roll-forward base must be the union latest (61,200), not max (62,000).
    await createLog({
      userId: ownerId,
      vehicleId,
      title: "Big service",
      odometer: 62_000,
      servicedAt: new Date("2026-01-01"),
    });
    await createOdometerReading({
      vehicleId,
      userId: ownerId,
      odometer: 61_200,
      readAt: new Date("2026-06-01"),
    });
    const rolled = await completeReminder({
      id: reminder.id,
      vehicleId,
      userId: ownerId,
    });
    expect(rolled?.dueMiles).toBe(66_200); // 61,200 + 5,000
    expect(rolled?.completedAt).toBeNull(); // recurring → stays active
  });
});
