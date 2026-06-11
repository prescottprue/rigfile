import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users } from "~/db/schema";
import { listLogAttachments } from "~/models/attachment.server";
import { createVehicle } from "~/models/vehicle.server";
import { createLogWithScan } from "~/scan/import.server";
import type { Storage, StoredFile } from "~/storage.server";

// Integration test — requires DATABASE_URL pointing at a running local
// Postgres with migrations applied. Storage is stubbed.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for scan import test");

const { db, close } = createDb(url);

class MemoryStorage implements Storage {
  readonly files = new Map<string, StoredFile>();
  async upload(
    key: string,
    body: Uint8Array | ArrayBuffer,
    contentType: string,
  ) {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
    this.files.set(key, { body: bytes, contentType });
  }
  async read(key: string) {
    return this.files.get(key) ?? null;
  }
  async exists(key: string) {
    return this.files.has(key);
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

let userId: string;
let vehicleId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `scan-import-test-${Date.now()}@example.com` })
    .returning();
  if (!user) throw new Error("user insert failed");
  userId = user.id;

  const vehicle = await createVehicle({
    userId,
    make: "Jeep",
    model: "Wrangler",
    year: 2021,
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await close();
});

describe("createLogWithScan", () => {
  it("creates the log, attaches the scan, and drafts the reminder", async () => {
    const storage = new MemoryStorage();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

    const result = await createLogWithScan({
      userId,
      vehicleId,
      log: {
        title: "Major service + brakes",
        notes: "• Front pads — $120.00",
        cost: 213,
        odometer: 84612,
        servicedAt: new Date("2026-05-02"),
        selfService: false,
      },
      scan: {
        body: bytes,
        contentType: "image/jpeg",
        originalName: "invoice-042.jpg",
      },
      reminder: {
        title: "Follow-up: Major service + brakes",
        notes: "pads at 5mm, replace in 5k mi",
      },
      storage,
    });

    expect(result.log.title).toBe("Major service + brakes");
    expect(result.log.cost).toBe(213);
    expect(result.log.odometer).toBe(84612);

    expect(result.attachment).not.toBeNull();
    expect(result.attachment?.kind).toBe("scan");
    expect(result.attachment?.contentType).toBe("image/jpeg");
    expect(storage.files.get(result.attachment?.path ?? "")?.body).toEqual(
      bytes,
    );

    const attachments = await listLogAttachments({
      logId: result.log.id,
      vehicleId,
      userId,
    });
    expect(attachments.map((a) => a.id)).toContain(result.attachment?.id);

    expect(result.reminder?.title).toBe("Follow-up: Major service + brakes");
    expect(result.reminder?.notes).toBe("pads at 5mm, replace in 5k mi");
  });

  it("skips attachment and reminder when not provided", async () => {
    const result = await createLogWithScan({
      userId,
      vehicleId,
      log: { title: "Oil change" },
    });
    expect(result.log.title).toBe("Oil change");
    expect(result.attachment).toBeNull();
    expect(result.reminder).toBeNull();
  });

  it("rejects users without crew access to the vehicle", async () => {
    const [stranger] = await db
      .insert(users)
      .values({ email: `scan-import-stranger-${Date.now()}@example.com` })
      .returning();
    if (!stranger) throw new Error("stranger insert failed");
    try {
      await expect(
        createLogWithScan({
          userId: stranger.id,
          vehicleId,
          log: { title: "Sneaky log" },
        }),
      ).rejects.toThrow("Vehicle not found");
    } finally {
      await db.delete(users).where(eq(users.id, stranger.id));
    }
  });
});
