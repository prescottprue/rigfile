import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { LogAttachment } from "~/db/schema";
import { logAttachments, logs } from "~/db/schema";
import { requireVehicleAccess } from "~/models/member.server";
import { getStorage, type Storage } from "~/storage.server";

export type { LogAttachment };

/** Strip a filename to a storage-key-safe slug, preserving the extension. */
function safeName(name: string | null | undefined): string {
  if (!name) return "scan";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 80) : "scan";
}

/**
 * Confirm the log exists on a vehicle the user can access. Attachments are
 * always reached through their log, so access is the log's access.
 */
async function requireLogAccess({
  logId,
  vehicleId,
  userId,
}: {
  logId: string;
  vehicleId: string;
  userId: string;
}): Promise<void> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [row] = await db
    .select({ id: logs.id })
    .from(logs)
    .where(and(eq(logs.id, logId), eq(logs.vehicleId, vehicleId)));
  if (!row) throw new Error("Log not found");
}

/**
 * Store a file (the original scan, a photo, a PDF) and attach it to a log.
 * Uploads the bytes to the storage driver under a per-log key, then records
 * the row. Access is checked against the log's vehicle.
 */
export async function addLogAttachment({
  logId,
  vehicleId,
  userId,
  body,
  contentType,
  originalName,
  kind = "scan",
  storage = getStorage(),
}: {
  logId: string;
  vehicleId: string;
  userId: string;
  body: Uint8Array | ArrayBuffer;
  contentType: string;
  originalName?: string | null;
  kind?: string;
  /** Override the storage driver (tests, or an explicit R2 binding). */
  storage?: Storage;
}): Promise<LogAttachment> {
  await requireLogAccess({ logId, vehicleId, userId });

  const key = `attachments/${logId}/${createId()}-${safeName(originalName)}`;
  await storage.upload(key, body, contentType);

  const db = await getDb();
  const [attachment] = await db
    .insert(logAttachments)
    .values({
      logId,
      path: key,
      contentType,
      originalName: originalName ?? null,
      kind,
    })
    .returning();
  if (!attachment) throw new Error("Failed to create attachment");
  return attachment;
}

export async function listLogAttachments({
  logId,
  vehicleId,
  userId,
}: {
  logId: string;
  vehicleId: string;
  userId: string;
}): Promise<LogAttachment[]> {
  await requireLogAccess({ logId, vehicleId, userId });
  const db = await getDb();
  return db
    .select()
    .from(logAttachments)
    .where(eq(logAttachments.logId, logId))
    .orderBy(asc(logAttachments.createdAt));
}
