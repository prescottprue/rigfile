import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "~/db/client";
import type {
  NewProject,
  NewProjectItem,
  Project,
  ProjectItem,
} from "~/db/schema";
import { projectItems, projects } from "~/db/schema";
import { requireVehicleAccess } from "~/models/member.server";
import type { ItemStatus, ProjectStatus } from "~/models/project.shared";

export type { ItemStatus, Project, ProjectItem, ProjectStatus };

export type ProjectListItem = Project & {
  itemCount: number;
  /** Sum of price × qty across all items (the full build estimate). */
  estimatedTotal: number;
  /** Sum across items that are ordered or further along (money committed). */
  committedTotal: number;
};

export type ProjectWithItems = Project & { items: ProjectItem[] };

function itemCost(item: Pick<ProjectItem, "price" | "quantity">): number {
  return (item.price ?? 0) * item.quantity;
}

export async function listProjects({
  vehicleId,
  userId,
}: {
  vehicleId: Project["vehicleId"];
  userId: string;
}): Promise<ProjectListItem[]> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.vehicleId, vehicleId))
    .orderBy(desc(projects.updatedAt));
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(projectItems)
    .where(
      inArray(
        projectItems.projectId,
        rows.map((p) => p.id),
      ),
    );
  const byProject = new Map<string, ProjectItem[]>();
  for (const item of items) {
    const list = byProject.get(item.projectId) ?? [];
    list.push(item);
    byProject.set(item.projectId, list);
  }

  return rows.map((p) => {
    const list = byProject.get(p.id) ?? [];
    return {
      ...p,
      itemCount: list.length,
      estimatedTotal: list.reduce((sum, i) => sum + itemCost(i), 0),
      committedTotal: list
        .filter((i) => i.status !== "proposed")
        .reduce((sum, i) => sum + itemCost(i), 0),
    };
  });
}

export async function getProject({
  id,
  vehicleId,
  userId,
}: {
  id: Project["id"];
  vehicleId: Project["vehicleId"];
  userId: string;
}): Promise<ProjectWithItems | null> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.vehicleId, vehicleId)));
  if (!project) return null;
  const items = await db
    .select()
    .from(projectItems)
    .where(eq(projectItems.projectId, id))
    .orderBy(projectItems.createdAt);
  return { ...project, items };
}

export async function createProject(
  input: NewProject & { userId: string },
): Promise<Project> {
  const { userId, ...values } = input;
  await requireVehicleAccess({ vehicleId: values.vehicleId, userId });
  const db = await getDb();
  const [project] = await db
    .insert(projects)
    .values({ ...values, createdById: userId })
    .returning();
  if (!project) throw new Error("Failed to create project");
  return project;
}

export async function updateProjectStatus({
  id,
  vehicleId,
  userId,
  status,
}: {
  id: Project["id"];
  vehicleId: Project["vehicleId"];
  userId: string;
  status: ProjectStatus;
}): Promise<Project | null> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [updated] = await db
    .update(projects)
    .set({ status })
    .where(and(eq(projects.id, id), eq(projects.vehicleId, vehicleId)))
    .returning();
  return updated ?? null;
}

export async function deleteProject({
  id,
  vehicleId,
  userId,
}: {
  id: Project["id"];
  vehicleId: Project["vehicleId"];
  userId: string;
}) {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  return db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.vehicleId, vehicleId)));
}

/** Verifies the item's project belongs to a vehicle the user can access. */
async function requireProjectAccess({
  projectId,
  vehicleId,
  userId,
}: {
  projectId: ProjectItem["projectId"];
  vehicleId: Project["vehicleId"];
  userId: string;
}) {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.vehicleId, vehicleId)));
  if (!project) throw new Error("Project not found");
}

export async function addProjectItem(
  input: NewProjectItem & { vehicleId: string; userId: string },
): Promise<ProjectItem> {
  const { vehicleId, userId, ...values } = input;
  await requireProjectAccess({
    projectId: values.projectId,
    vehicleId,
    userId,
  });
  const db = await getDb();
  const [item] = await db.insert(projectItems).values(values).returning();
  if (!item) throw new Error("Failed to add item");
  return item;
}

export async function updateProjectItemStatus({
  id,
  projectId,
  vehicleId,
  userId,
  status,
}: {
  id: ProjectItem["id"];
  projectId: ProjectItem["projectId"];
  vehicleId: Project["vehicleId"];
  userId: string;
  status: ItemStatus;
}): Promise<ProjectItem | null> {
  await requireProjectAccess({ projectId, vehicleId, userId });
  const db = await getDb();
  const [updated] = await db
    .update(projectItems)
    .set({ status })
    .where(and(eq(projectItems.id, id), eq(projectItems.projectId, projectId)))
    .returning();
  return updated ?? null;
}

export async function deleteProjectItem({
  id,
  projectId,
  vehicleId,
  userId,
}: {
  id: ProjectItem["id"];
  projectId: ProjectItem["projectId"];
  vehicleId: Project["vehicleId"];
  userId: string;
}) {
  await requireProjectAccess({ projectId, vehicleId, userId });
  const db = await getDb();
  return db
    .delete(projectItems)
    .where(and(eq(projectItems.id, id), eq(projectItems.projectId, projectId)));
}
