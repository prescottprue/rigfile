import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users, vehicleMembers } from "~/db/schema";
import {
  addVehicleDocument,
  deleteDocumentBlobsForVehicles,
  listVehicleDocuments,
  removeVehicleDocument,
  searchVehicleDocuments,
  updateVehicleDocument,
} from "~/models/document.server";
import { createVehicle, deleteVehicle } from "~/models/vehicle.server";
import type { Storage, StoredFile } from "~/storage.server";

// Integration test — requires DATABASE_URL pointing at a running local Postgres
// with migrations applied. Storage is stubbed so we don't touch the filesystem.
// Documents are uploaded as PDFs so the (best-effort, backend-dependent) OCR
// path is skipped and the test stays hermetic.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for document test");

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
  async delete(key: string) {
    this.files.delete(key);
  }
}

const stamp = Date.now();
let ownerId: string;
let memberId: string;
let vehicleId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(users)
    .values({ email: `doc-owner-${stamp}@example.com` })
    .returning();
  const [member] = await db
    .insert(users)
    .values({ email: `doc-member-${stamp}@example.com` })
    .returning();
  if (!owner || !member) throw new Error("user insert failed");
  ownerId = owner.id;
  memberId = member.id;

  const vehicle = await createVehicle({
    userId: ownerId,
    make: "Test",
    model: "Vehicle",
    year: 2020,
  });
  vehicleId = vehicle.id;

  await db
    .insert(vehicleMembers)
    .values({ vehicleId, userId: memberId, role: "member" });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, memberId));
  await close();
});

describe("vehicle documents", () => {
  it("stores bytes, records the row, and tags the uploader", async () => {
    const storage = new MemoryStorage();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const doc = await addVehicleDocument({
      vehicleId,
      userId: ownerId,
      body: bytes,
      contentType: "application/pdf",
      originalName: "Purchase Contract.pdf",
      kind: "purchase",
      label: "Bought from Bay Area Jeep",
      storage,
    });

    expect(doc.vehicleId).toBe(vehicleId);
    expect(doc.kind).toBe("purchase");
    expect(doc.uploadedById).toBe(ownerId);
    expect(doc.path.startsWith(`vehicle-documents/${vehicleId}/`)).toBe(true);
    expect(doc.path).toContain("purchase-contract.pdf");
    expect(storage.files.get(doc.path)?.body).toEqual(bytes);

    const list = await listVehicleDocuments({ vehicleId, userId: memberId });
    expect(list.map((d) => d.id)).toContain(doc.id);
  });

  it("coerces an unknown kind to 'other'", async () => {
    const doc = await addVehicleDocument({
      vehicleId,
      userId: ownerId,
      body: new Uint8Array([5]),
      contentType: "application/pdf",
      kind: "not-a-real-kind",
      storage: new MemoryStorage(),
    });
    expect(doc.kind).toBe("other");
  });

  it("full-text searches over the label", async () => {
    await addVehicleDocument({
      vehicleId,
      userId: ownerId,
      body: new Uint8Array([7]),
      contentType: "application/pdf",
      kind: "registration",
      label: "2024 registration renewal sticker",
      storage: new MemoryStorage(),
    });

    const hits = await searchVehicleDocuments({
      vehicleId,
      userId: memberId,
      query: "renewal",
    });
    expect(hits.some((d) => d.label?.includes("renewal"))).toBe(true);

    const misses = await searchVehicleDocuments({
      vehicleId,
      userId: memberId,
      query: "transmission",
    });
    expect(misses.some((d) => d.label?.includes("renewal"))).toBe(false);
  });

  it("retags a document", async () => {
    const doc = await addVehicleDocument({
      vehicleId,
      userId: ownerId,
      body: new Uint8Array([8]),
      contentType: "application/pdf",
      kind: "other",
      storage: new MemoryStorage(),
    });
    const updated = await updateVehicleDocument({
      id: doc.id,
      vehicleId,
      userId: memberId,
      kind: "title",
    });
    expect(updated?.kind).toBe("title");
  });

  it("rejects access from a user without crew membership", async () => {
    const [stranger] = await db
      .insert(users)
      .values({ email: `doc-stranger-${stamp}@example.com` })
      .returning();
    if (!stranger) throw new Error("stranger insert failed");
    try {
      await expect(
        listVehicleDocuments({ vehicleId, userId: stranger.id }),
      ).rejects.toThrow("Vehicle not found");
    } finally {
      await db.delete(users).where(eq(users.id, stranger.id));
    }
  });

  it("lets the uploader delete, removing the row and the bytes", async () => {
    const storage = new MemoryStorage();
    const doc = await addVehicleDocument({
      vehicleId,
      userId: memberId,
      body: new Uint8Array([9, 9]),
      contentType: "application/pdf",
      storage,
    });
    const deleted = await removeVehicleDocument({
      id: doc.id,
      vehicleId,
      userId: memberId,
      storage,
    });
    expect(deleted?.id).toBe(doc.id);
    expect(storage.files.has(doc.path)).toBe(false);
  });

  it("blocks a non-uploader member from deleting, but lets the owner", async () => {
    const storage = new MemoryStorage();
    const doc = await addVehicleDocument({
      vehicleId,
      userId: ownerId,
      body: new Uint8Array([1]),
      contentType: "application/pdf",
      storage,
    });

    await expect(
      removeVehicleDocument({
        id: doc.id,
        vehicleId,
        userId: memberId,
        storage,
      }),
    ).rejects.toThrow("Only the uploader or the owner");

    const deleted = await removeVehicleDocument({
      id: doc.id,
      vehicleId,
      userId: ownerId,
      storage,
    });
    expect(deleted?.id).toBe(doc.id);
  });

  it("reaps document blobs when the vehicle is deleted", async () => {
    const storage = new MemoryStorage();
    const throwaway = await createVehicle({
      userId: ownerId,
      make: "Throw",
      model: "Away",
      year: 2021,
    });
    const doc = await addVehicleDocument({
      vehicleId: throwaway.id,
      userId: ownerId,
      body: new Uint8Array([3, 3, 3]),
      contentType: "application/pdf",
      storage,
    });
    expect(storage.files.has(doc.path)).toBe(true);

    await deleteVehicle({ id: throwaway.id, userId: ownerId, storage });
    expect(storage.files.has(doc.path)).toBe(false);
  });

  it("deleteDocumentBlobsForVehicles is a no-op for an empty list", async () => {
    await expect(
      deleteDocumentBlobsForVehicles({ vehicleIds: [] }),
    ).resolves.toBeUndefined();
  });
});
