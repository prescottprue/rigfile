import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { mechanics } from "~/db/schema";
import { findOrCreateMechanic } from "~/models/mechanic.server";

// Integration test — requires DATABASE_URL pointing at a running local
// Postgres with migrations applied.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for mechanic test");

const { db, close } = createDb(url);

const stamp = Date.now();
const createdIds: string[] = [];

afterAll(async () => {
  if (createdIds.length > 0) {
    await db.delete(mechanics).where(inArray(mechanics.id, createdIds));
  }
  await close();
});

describe("findOrCreateMechanic", () => {
  it("creates a vendor and dedupes case-insensitively", async () => {
    const name = `Desert 4x4 Test ${stamp}`;
    const first = await findOrCreateMechanic({ name, location: "Reno, NV" });
    createdIds.push(first.id);
    expect(first.name).toBe(name);
    expect(first.location).toBe("Reno, NV");

    const second = await findOrCreateMechanic({
      name: name.toUpperCase(),
      location: "Sparks, NV",
    });
    expect(second.id).toBe(first.id);
    // Original location wins once set.
    expect(second.location).toBe("Reno, NV");
  });

  it("backfills a missing location from a later receipt", async () => {
    const name = `No Location Garage ${stamp}`;
    const first = await findOrCreateMechanic({ name });
    createdIds.push(first.id);
    expect(first.location).toBe("");

    const second = await findOrCreateMechanic({
      name,
      location: "Fernley, NV",
    });
    expect(second.id).toBe(first.id);
    expect(second.location).toBe("Fernley, NV");

    const [row] = await db
      .select()
      .from(mechanics)
      .where(eq(mechanics.id, first.id));
    expect(row?.location).toBe("Fernley, NV");
  });

  it("rejects empty names", async () => {
    await expect(findOrCreateMechanic({ name: "   " })).rejects.toThrow(
      "Vendor name is required",
    );
  });
});
