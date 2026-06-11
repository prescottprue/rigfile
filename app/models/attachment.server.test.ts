import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users } from "~/db/schema";
import {
  addLogAttachment,
  listLogAttachments,
} from "~/models/attachment.server";
import { createLog } from "~/models/log.server";
import { createVehicle } from "~/models/vehicle.server";
import type { Storage, StoredFile } from "~/storage.server";

// Integration test — requires DATABASE_URL pointing at a running local Postgres
// with migrations applied. Storage is stubbed so we don't touch the filesystem.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for attachment test");

const { db, close } = createDb(url);

/** In-memory Storage so the test never hits disk or R2. */
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
}

let userId: string;
let vehicleId: string;
let logId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `attach-test-${Date.now()}@example.com` })
    .returning();
  if (!user) throw new Error("user insert failed");
  userId = user.id;

  const vehicle = await createVehicle({
    userId,
    make: "Test",
    model: "Vehicle",
    year: 2020,
  });
  vehicleId = vehicle.id;

  const log = await createLog({ userId, vehicleId, title: "Shop service" });
  logId = log.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await close();
});

describe("log attachments", () => {
  it("uploads bytes and records the attachment", async () => {
    const storage = new MemoryStorage();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const attachment = await addLogAttachment({
      logId,
      vehicleId,
      userId,
      body: bytes,
      contentType: "image/png",
      originalName: "Receipt #42.png",
      storage,
    });

    expect(attachment.logId).toBe(logId);
    expect(attachment.contentType).toBe("image/png");
    expect(attachment.path.startsWith(`attachments/${logId}/`)).toBe(true);
    // Filename is slugified into the storage key.
    expect(attachment.path).toContain("receipt-42.png");
    expect(storage.files.get(attachment.path)?.body).toEqual(bytes);

    const list = await listLogAttachments({ logId, vehicleId, userId });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(attachment.id);
  });

  it("rejects attaching to a log on a vehicle the user can't access", async () => {
    const [stranger] = await db
      .insert(users)
      .values({ email: `attach-stranger-${Date.now()}@example.com` })
      .returning();
    if (!stranger) throw new Error("stranger insert failed");
    try {
      await expect(
        addLogAttachment({
          logId,
          vehicleId,
          userId: stranger.id,
          body: new Uint8Array([0]),
          contentType: "image/png",
          storage: new MemoryStorage(),
        }),
      ).rejects.toThrow("Vehicle not found");
    } finally {
      await db.delete(users).where(eq(users.id, stranger.id));
    }
  });
});
