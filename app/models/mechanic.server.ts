import { eq, sql } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { Mechanic } from "~/db/schema";
import { mechanics } from "~/db/schema";

export type { Mechanic };

/**
 * Find a vendor by name (case-insensitive) or create it. Vendors come from
 * scanned receipts and the log forms' Shop field, so the same shop arrives
 * with varying capitalization — "Desert 4x4" and "DESERT 4X4" should be one
 * filterable vendor, not two.
 */
export async function findOrCreateMechanic({
  name,
  location,
}: {
  name: string;
  location?: string | null;
}): Promise<Mechanic> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Vendor name is required");

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(mechanics)
    .where(sql`lower(${mechanics.name}) = lower(${trimmed})`)
    .limit(1);
  if (existing) {
    // Backfill a location learned from a later receipt.
    if (!existing.location && location?.trim()) {
      const [updated] = await db
        .update(mechanics)
        .set({ location: location.trim() })
        .where(eq(mechanics.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const [created] = await db
    .insert(mechanics)
    .values({ name: trimmed, location: location?.trim() ?? "" })
    .returning();
  if (!created) throw new Error("Failed to create vendor");
  return created;
}
