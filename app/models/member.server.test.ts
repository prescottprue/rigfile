import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users } from "~/db/schema";
import { createLog, getLogListItems } from "~/models/log.server";
import {
  claimPendingInvites,
  inviteToCrew,
  listCrew,
  removeCrewMember,
} from "~/models/member.server";
import { createVehicle, getVehicle } from "~/models/vehicle.server";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for member.server.test.ts");

const { db, close } = createDb(url);

const stamp = Date.now();
let ownerId: string;
let wifeId: string;
let vehicleId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(users)
    .values({ email: `crew-owner-${stamp}@example.com` })
    .returning();
  const [wife] = await db
    .insert(users)
    .values({ email: `crew-wife-${stamp}@example.com` })
    .returning();
  if (!owner || !wife) throw new Error("user insert failed");
  ownerId = owner.id;
  wifeId = wife.id;

  const vehicle = await createVehicle({
    userId: ownerId,
    make: "Subaru",
    model: "WRX",
    year: 2007,
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, wifeId));
  await close();
});

describe("crew sharing", () => {
  it("creating a vehicle makes the creator the owner", async () => {
    const vehicle = await getVehicle({ id: vehicleId, userId: ownerId });
    expect(vehicle?.role).toBe("owner");
  });

  it("inviting an existing user adds them immediately with member role", async () => {
    const result = await inviteToCrew({
      vehicleId,
      userId: ownerId,
      email: `crew-wife-${stamp}@example.com`,
    });
    expect(result.status).toBe("added");

    const vehicle = await getVehicle({ id: vehicleId, userId: wifeId });
    expect(vehicle?.role).toBe("member");
  });

  it("members can read and write logs on the shared vehicle", async () => {
    await createLog({
      userId: wifeId,
      vehicleId,
      title: "Swapped rally tires",
    });
    const logs = await getLogListItems({ userId: ownerId, vehicleId });
    expect(logs.some((l) => l.title === "Swapped rally tires")).toBe(true);
  });

  it("members cannot invite others (owner only)", async () => {
    await expect(
      inviteToCrew({
        vehicleId,
        userId: wifeId,
        email: "someone-else@example.com",
      }),
    ).rejects.toThrow("Only the owner");
  });

  it("inviting an unknown email stores a pending invite claimed at signup", async () => {
    const email = `crew-future-${stamp}@example.com`;
    const result = await inviteToCrew({ vehicleId, userId: ownerId, email });
    expect(result.status).toBe("invited");

    const crew = await listCrew({ vehicleId, userId: ownerId });
    expect(crew.pendingInvites.some((i) => i.email === email)).toBe(true);

    // ...the future user signs up:
    const [futureUser] = await db.insert(users).values({ email }).returning();
    if (!futureUser) throw new Error("future user insert failed");
    try {
      const claimed = await claimPendingInvites({
        userId: futureUser.id,
        email,
      });
      expect(claimed).toBe(1);
      const vehicle = await getVehicle({
        id: vehicleId,
        userId: futureUser.id,
      });
      expect(vehicle?.role).toBe("member");
    } finally {
      await db.delete(users).where(eq(users.id, futureUser.id));
    }
  });

  it("owner can remove a member, and the owner row is protected", async () => {
    await removeCrewMember({
      vehicleId,
      userId: ownerId,
      memberUserId: wifeId,
    });
    expect(await getVehicle({ id: vehicleId, userId: wifeId })).toBeNull();

    // Removing the owner is a no-op
    await removeCrewMember({
      vehicleId,
      userId: ownerId,
      memberUserId: ownerId,
    });
    const vehicle = await getVehicle({ id: vehicleId, userId: ownerId });
    expect(vehicle?.role).toBe("owner");
  });
});
