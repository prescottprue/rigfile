import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "~/db/client";
import { users } from "~/db/schema";
import {
  addProjectItem,
  createProject,
  getProject,
  listProjects,
  updateProjectItemStatus,
} from "~/models/project.server";
import { createVehicle } from "~/models/vehicle.server";

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL is required for project.server.test.ts");

const { db, close } = createDb(url);

let userId: string;
let vehicleId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `project-test-${Date.now()}@example.com` })
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

describe("projects", () => {
  it("tracks estimated vs committed budget across item statuses", async () => {
    const project = await createProject({
      vehicleId,
      userId,
      title: "Rally prep",
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const pads = await addProjectItem({
      vehicleId,
      userId,
      projectId: project.id,
      name: "Brake pads",
      price: 200,
      quantity: 2,
    });
    await addProjectItem({
      vehicleId,
      userId,
      projectId: project.id,
      name: "Skid plate",
      price: 350,
      quantity: 1,
    });
    await addProjectItem({
      vehicleId,
      userId,
      projectId: project.id,
      name: "Mud flaps (no price yet)",
      quantity: 4,
    });

    let [listed] = await listProjects({ vehicleId, userId });
    expect(listed?.itemCount).toBe(3);
    expect(listed?.estimatedTotal).toBe(750); // 200×2 + 350
    expect(listed?.committedTotal).toBe(0); // everything still proposed

    await updateProjectItemStatus({
      id: pads.id,
      projectId: project.id,
      vehicleId,
      userId,
      status: "ordered",
    });

    [listed] = await listProjects({ vehicleId, userId });
    expect(listed?.committedTotal).toBe(400);

    const detail = await getProject({
      id: project.id,
      vehicleId,
      userId,
    });
    expect(detail?.items).toHaveLength(3);
    expect(detail?.items.find((i) => i.id === pads.id)?.status).toBe("ordered");
  });

  it("denies access to non-members", async () => {
    const [stranger] = await db
      .insert(users)
      .values({ email: `project-stranger-${Date.now()}@example.com` })
      .returning();
    if (!stranger) throw new Error("stranger insert failed");
    try {
      await expect(
        listProjects({ vehicleId, userId: stranger.id }),
      ).rejects.toThrow("Vehicle not found");
    } finally {
      await db.delete(users).where(eq(users.id, stranger.id));
    }
  });
});
