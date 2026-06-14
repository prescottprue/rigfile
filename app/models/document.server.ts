import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { VehicleDocument } from "~/db/schema";
import { users, vehicleDocuments } from "~/db/schema";
import { normalizeDocumentKind } from "~/models/document.shared";
import { requireVehicleAccess, type VehicleRole } from "~/models/member.server";
import { transcribeImage } from "~/scan/extract.server";
import { getStorage, type Storage } from "~/storage.server";

export type { VehicleDocument };

export type VehicleDocumentListItem = VehicleDocument & {
  uploaderName: string | null;
};

/** Strip a filename to a storage-key-safe slug, preserving the extension. */
function safeName(name: string | null | undefined): string {
  if (!name) return "document";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 80) : "document";
}

const uploaderName = sql<
  string | null
>`coalesce(${users.displayName}, ${users.email})`;

/** All documents on a vehicle, newest first. Any crew member can view. */
export async function listVehicleDocuments({
  vehicleId,
  userId,
}: {
  vehicleId: string;
  userId: string;
}): Promise<VehicleDocumentListItem[]> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const rows = await db
    .select({ doc: vehicleDocuments, uploaderName })
    .from(vehicleDocuments)
    .leftJoin(users, eq(users.id, vehicleDocuments.uploadedById))
    .where(eq(vehicleDocuments.vehicleId, vehicleId))
    .orderBy(desc(vehicleDocuments.createdAt));
  return rows.map((r) => ({ ...r.doc, uploaderName: r.uploaderName }));
}

/**
 * Full-text search over a vehicle's documents — matches the generated
 * `search_tsv` (label + filename + OCR'd text) GIN index, so a word that
 * only appears inside a scanned image still hits.
 */
export async function searchVehicleDocuments({
  vehicleId,
  userId,
  query,
}: {
  vehicleId: string;
  userId: string;
  query: string;
}): Promise<VehicleDocumentListItem[]> {
  await requireVehicleAccess({ vehicleId, userId });
  const trimmed = query.trim();
  if (!trimmed) return listVehicleDocuments({ vehicleId, userId });
  const db = await getDb();
  const rows = await db
    .select({ doc: vehicleDocuments, uploaderName })
    .from(vehicleDocuments)
    .leftJoin(users, eq(users.id, vehicleDocuments.uploadedById))
    .where(
      and(
        eq(vehicleDocuments.vehicleId, vehicleId),
        sql`${vehicleDocuments.searchTsv} @@ websearch_to_tsquery('english', ${trimmed})`,
      ),
    )
    .orderBy(desc(vehicleDocuments.createdAt));
  return rows.map((r) => ({ ...r.doc, uploaderName: r.uploaderName }));
}

/**
 * Store a document on a vehicle and (for images) OCR it for search. Any crew
 * member may add. OCR is best-effort — a transcription failure never blocks
 * the upload; the document is still stored and searchable by label/filename.
 */
export async function addVehicleDocument({
  vehicleId,
  userId,
  body,
  contentType,
  originalName,
  kind,
  label,
  storage = getStorage(),
}: {
  vehicleId: string;
  userId: string;
  body: Uint8Array;
  contentType: string;
  originalName?: string | null;
  kind?: string | null;
  label?: string | null;
  storage?: Storage;
}): Promise<VehicleDocument> {
  await requireVehicleAccess({ vehicleId, userId });

  const key = `vehicle-documents/${vehicleId}/${createId()}-${safeName(originalName)}`;
  await storage.upload(key, body, contentType);

  let extractedText: string | null = null;
  if (contentType.startsWith("image/")) {
    extractedText = await transcribeImage(body, contentType);
  }

  const db = await getDb();
  const [doc] = await db
    .insert(vehicleDocuments)
    .values({
      vehicleId,
      path: key,
      contentType,
      originalName: originalName ?? null,
      kind: normalizeDocumentKind(kind),
      label: label?.trim() || null,
      extractedText,
      uploadedById: userId,
    })
    .returning();
  if (!doc) throw new Error("Failed to save document");
  return doc;
}

/** Edit a document's tag/label without re-uploading. Any crew member. */
export async function updateVehicleDocument({
  id,
  vehicleId,
  userId,
  kind,
  label,
}: {
  id: string;
  vehicleId: string;
  userId: string;
  kind?: string | null;
  label?: string | null;
}): Promise<VehicleDocument | null> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [updated] = await db
    .update(vehicleDocuments)
    .set({
      ...(kind !== undefined ? { kind: normalizeDocumentKind(kind) } : {}),
      ...(label !== undefined ? { label: label?.trim() || null } : {}),
    })
    .where(
      and(
        eq(vehicleDocuments.id, id),
        eq(vehicleDocuments.vehicleId, vehicleId),
      ),
    )
    .returning();
  return updated ?? null;
}

/**
 * Delete a document — the row and the stored bytes. The uploader or the
 * vehicle owner may delete (same rule as manual odometer readings).
 */
export async function removeVehicleDocument({
  id,
  vehicleId,
  userId,
  storage = getStorage(),
}: {
  id: string;
  vehicleId: string;
  userId: string;
  storage?: Storage;
}): Promise<VehicleDocument | null> {
  const role: VehicleRole = await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [doc] = await db
    .select()
    .from(vehicleDocuments)
    .where(
      and(
        eq(vehicleDocuments.id, id),
        eq(vehicleDocuments.vehicleId, vehicleId),
      ),
    );
  if (!doc) return null;
  if (doc.uploadedById !== userId && role !== "owner") {
    throw new Error("Only the uploader or the owner can delete a document");
  }
  await db.delete(vehicleDocuments).where(eq(vehicleDocuments.id, id));
  await storage.delete(doc.path);
  return doc;
}

/**
 * Blob cleanup for cascading vehicle deletes: remove the stored bytes for
 * every document on the given vehicles. The rows themselves cascade via the
 * FK; this only reaps storage. Access must already be checked by the caller.
 */
export async function deleteDocumentBlobsForVehicles({
  vehicleIds,
  storage = getStorage(),
}: {
  vehicleIds: string[];
  storage?: Storage;
}): Promise<void> {
  if (vehicleIds.length === 0) return;
  const db = await getDb();
  const rows = await db
    .select({ path: vehicleDocuments.path })
    .from(vehicleDocuments)
    .where(inArray(vehicleDocuments.vehicleId, vehicleIds));
  await Promise.all(rows.map((row) => storage.delete(row.path)));
}
