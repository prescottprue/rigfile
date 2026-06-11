import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users } from "~/db/schema";
import { createLog } from "~/models/log.server";
import {
  completeReminder,
  computeReminderStatus,
  createReminder,
  listReminders,
} from "~/models/reminder.server";
import { createVehicle } from "~/models/vehicle.server";

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL is required for reminder.server.test.ts");

const { db, close } = createDb(url);

let userId: string;
let vehicleId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `reminder-test-${Date.now()}@example.com` })
    .returning();
  if (!user) throw new Error("user insert failed");
  userId = user.id;
  const vehicle = await createVehicle({
    userId,
    make: "Test",
    model: "Rally",
    year: 2018,
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await close();
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe("computeReminderStatus", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  const base = { completedAt: null, dueDate: null, dueMiles: null };

  it("is overdue when the date has passed", () => {
    const result = computeReminderStatus(
      { ...base, dueDate: new Date(now.getTime() - 2 * DAY_MS) },
      null,
      now,
    );
    expect(result.status).toBe("overdue");
    expect(result.daysLeft).toBeLessThanOrEqual(0);
  });

  it("is overdue when mileage has been crossed, even with a far-off date", () => {
    const result = computeReminderStatus(
      {
        ...base,
        dueDate: new Date(now.getTime() + 90 * DAY_MS),
        dueMiles: 98000,
      },
      98500,
      now,
    );
    expect(result.status).toBe("overdue");
    expect(result.milesLeft).toBe(-500);
  });

  it("is due_soon within the day/mile thresholds", () => {
    expect(
      computeReminderStatus(
        { ...base, dueDate: new Date(now.getTime() + 10 * DAY_MS) },
        null,
        now,
      ).status,
    ).toBe("due_soon");
    expect(
      computeReminderStatus({ ...base, dueMiles: 98400 }, 98000, now).status,
    ).toBe("due_soon");
  });

  it("is ok when nothing is close, and mileage is ignored without an odometer", () => {
    expect(
      computeReminderStatus(
        { ...base, dueDate: new Date(now.getTime() + 90 * DAY_MS) },
        null,
        now,
      ).status,
    ).toBe("ok");
    expect(
      computeReminderStatus({ ...base, dueMiles: 1 }, null, now).status,
    ).toBe("ok");
  });

  it("is done once completed", () => {
    expect(
      computeReminderStatus({ ...base, completedAt: now }, null, now).status,
    ).toBe("done");
  });
});

describe("completeReminder", () => {
  it("one-shot reminders get completedAt set", async () => {
    const reminder = await createReminder({
      vehicleId,
      userId,
      title: "Rally tech inspection",
      dueDate: new Date(Date.now() + 5 * DAY_MS),
    });
    const updated = await completeReminder({
      id: reminder.id,
      vehicleId,
      userId,
    });
    expect(updated?.completedAt).not.toBeNull();
  });

  it("recurring reminders roll forward from the completion odometer", async () => {
    await createLog({
      userId,
      vehicleId,
      title: "Baseline",
      odometer: 50000,
    });
    const reminder = await createReminder({
      vehicleId,
      userId,
      title: "Oil change",
      dueMiles: 50500,
      intervalMiles: 5000,
      intervalMonths: 6,
    });
    const updated = await completeReminder({
      id: reminder.id,
      vehicleId,
      userId,
      odometer: 50600,
    });
    expect(updated?.completedAt).toBeNull(); // still active, rolled forward
    expect(updated?.dueMiles).toBe(55600);
    expect(updated?.dueDate).not.toBeNull();

    const list = await listReminders({ vehicleId, userId });
    const rolled = list.find((r) => r.id === reminder.id);
    expect(rolled?.status).toBe("ok");
  });
});
