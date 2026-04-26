import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { logs, users, vehicles } from "~/db/schema";
import {
  createLogFile,
  deleteLogFile,
  getLogFileCountsByLogIds,
  getLogFiles,
} from "~/models/log-file.server";

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL is required for log-file.server.test.ts");

const { db, close } = createDb(url);

let userId: string;
let otherUserId: string;
let vehicleId: string;
let logId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `logfile-test-${Date.now()}@example.com` })
    .returning();
  if (!user) throw new Error("user insert failed");
  userId = user.id;

  const [otherUser] = await db
    .insert(users)
    .values({ email: `logfile-other-${Date.now()}@example.com` })
    .returning();
  if (!otherUser) throw new Error("other user insert failed");
  otherUserId = otherUser.id;

  const [vehicle] = await db
    .insert(vehicles)
    .values({ userId, make: "Test", model: "Vehicle", year: 2020 })
    .returning();
  if (!vehicle) throw new Error("vehicle insert failed");
  vehicleId = vehicle.id;

  const [log] = await db
    .insert(logs)
    .values({ userId, vehicleId, title: "Test log for files" })
    .returning();
  if (!log) throw new Error("log insert failed");
  logId = log.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherUserId));
  await close();
});

describe("log-file model", () => {
  it("creates, lists, and deletes log files", async () => {
    const file = await createLogFile({
      logId,
      userId,
      filePath: `log-files/${userId}/${logId}/test-file-1`,
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      fileSize: 12345,
      category: "document",
      description: "Test receipt",
    });

    expect(file.id).toBeTruthy();
    expect(file.fileName).toBe("receipt.pdf");
    expect(file.category).toBe("document");

    const files = await getLogFiles({ logId, userId, vehicleId });
    expect(files).toHaveLength(1);
    expect(files[0]?.fileName).toBe("receipt.pdf");

    const deleted = await deleteLogFile({ id: file.id, userId });
    expect(deleted).not.toBeNull();
    expect(deleted?.filePath).toBe(`log-files/${userId}/${logId}/test-file-1`);

    const afterDelete = await getLogFiles({ logId, userId, vehicleId });
    expect(afterDelete).toHaveLength(0);
  });

  it("scopes queries by userId — other users cannot see or delete files", async () => {
    const file = await createLogFile({
      logId,
      userId,
      filePath: `log-files/${userId}/${logId}/scoped-file`,
      fileName: "secret.png",
      contentType: "image/png",
      fileSize: 5000,
      category: "image",
    });

    const otherUserFiles = await getLogFiles({
      logId,
      userId: otherUserId,
      vehicleId,
    });
    expect(otherUserFiles).toHaveLength(0);

    const otherDelete = await deleteLogFile({
      id: file.id,
      userId: otherUserId,
    });
    expect(otherDelete).toBeNull();

    const ownerFiles = await getLogFiles({ logId, userId, vehicleId });
    expect(ownerFiles).toHaveLength(1);

    await deleteLogFile({ id: file.id, userId });
  });

  it("returns file counts grouped by logId", async () => {
    const [log2] = await db
      .insert(logs)
      .values({ userId, vehicleId, title: "Second log" })
      .returning();
    if (!log2) throw new Error("second log insert failed");

    await createLogFile({
      logId,
      userId,
      filePath: `log-files/${userId}/${logId}/count-1`,
      fileName: "a.png",
      contentType: "image/png",
      fileSize: 100,
      category: "image",
    });
    await createLogFile({
      logId,
      userId,
      filePath: `log-files/${userId}/${logId}/count-2`,
      fileName: "b.png",
      contentType: "image/png",
      fileSize: 200,
      category: "image",
    });
    await createLogFile({
      logId: log2.id,
      userId,
      filePath: `log-files/${userId}/${log2.id}/count-1`,
      fileName: "c.pdf",
      contentType: "application/pdf",
      fileSize: 300,
      category: "document",
    });

    const counts = await getLogFileCountsByLogIds({
      logIds: [logId, log2.id],
      userId,
    });
    expect(counts[logId]).toBe(2);
    expect(counts[log2.id]).toBe(1);

    // Clean up
    const files = await getLogFiles({ logId, userId, vehicleId });
    for (const f of files) {
      await deleteLogFile({ id: f.id, userId });
    }
    await db.delete(logs).where(eq(logs.id, log2.id));
  });

  it("cascade deletes files when parent log is deleted", async () => {
    const [tempLog] = await db
      .insert(logs)
      .values({ userId, vehicleId, title: "Cascade test log" })
      .returning();
    if (!tempLog) throw new Error("temp log insert failed");

    await createLogFile({
      logId: tempLog.id,
      userId,
      filePath: `log-files/${userId}/${tempLog.id}/cascade-file`,
      fileName: "cascade.png",
      contentType: "image/png",
      fileSize: 100,
      category: "image",
    });

    const beforeDelete = await getLogFiles({
      logId: tempLog.id,
      userId,
      vehicleId,
    });
    expect(beforeDelete).toHaveLength(1);

    await db.delete(logs).where(eq(logs.id, tempLog.id));

    const afterDelete = await getLogFiles({
      logId: tempLog.id,
      userId,
      vehicleId,
    });
    expect(afterDelete).toHaveLength(0);
  });
});
