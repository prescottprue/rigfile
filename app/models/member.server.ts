import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { User, Vehicle, VehicleInvite } from "~/db/schema";
import { users, vehicleInvites, vehicleMembers } from "~/db/schema";

export type VehicleRole = "owner" | "member";

export type CrewMember = {
  userId: string;
  role: VehicleRole;
  email: string;
  displayName: string | null;
  avatarPath: string | null;
};

export type PendingInvite = Pick<VehicleInvite, "id" | "email" | "createdAt">;

/**
 * Role of `userId` on `vehicleId`, or null if they have no access.
 * Every vehicle-scoped read/write goes through this (or a join on
 * vehicle_members) — never trust a vehicleId from the client alone.
 */
export async function getVehicleRole({
  vehicleId,
  userId,
}: {
  vehicleId: Vehicle["id"];
  userId: User["id"];
}): Promise<VehicleRole | null> {
  const db = await getDb();
  const [row] = await db
    .select({ role: vehicleMembers.role })
    .from(vehicleMembers)
    .where(
      and(
        eq(vehicleMembers.vehicleId, vehicleId),
        eq(vehicleMembers.userId, userId),
      ),
    );
  return (row?.role as VehicleRole) ?? null;
}

export async function requireVehicleAccess({
  vehicleId,
  userId,
}: {
  vehicleId: Vehicle["id"];
  userId: User["id"];
}): Promise<VehicleRole> {
  const role = await getVehicleRole({ vehicleId, userId });
  if (!role) throw new Error("Vehicle not found");
  return role;
}

export async function requireVehicleOwner({
  vehicleId,
  userId,
}: {
  vehicleId: Vehicle["id"];
  userId: User["id"];
}): Promise<void> {
  const role = await getVehicleRole({ vehicleId, userId });
  if (!role) throw new Error("Vehicle not found");
  if (role !== "owner") throw new Error("Only the owner can do that");
}

export async function listCrew({
  vehicleId,
  userId,
}: {
  vehicleId: Vehicle["id"];
  userId: User["id"];
}): Promise<{ members: CrewMember[]; pendingInvites: PendingInvite[] }> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const members = await db
    .select({
      userId: vehicleMembers.userId,
      role: vehicleMembers.role,
      email: users.email,
      displayName: users.displayName,
      avatarPath: users.avatarPath,
    })
    .from(vehicleMembers)
    .innerJoin(users, eq(users.id, vehicleMembers.userId))
    .where(eq(vehicleMembers.vehicleId, vehicleId))
    .orderBy(vehicleMembers.createdAt);
  const pendingInvites = await db
    .select({
      id: vehicleInvites.id,
      email: vehicleInvites.email,
      createdAt: vehicleInvites.createdAt,
    })
    .from(vehicleInvites)
    .where(
      and(
        eq(vehicleInvites.vehicleId, vehicleId),
        isNull(vehicleInvites.acceptedAt),
      ),
    )
    .orderBy(vehicleInvites.createdAt);
  return {
    members: members.map((m) => ({ ...m, role: m.role as VehicleRole })),
    pendingInvites,
  };
}

export type InviteResult =
  | { status: "added"; email: string }
  | { status: "invited"; email: string }
  | { status: "already"; email: string };

/**
 * Invite an email to the crew. If a user with that email exists they're
 * added immediately; otherwise a pending invite is stored and claimed when
 * they sign up. Owner only.
 */
export async function inviteToCrew({
  vehicleId,
  userId,
  email: rawEmail,
}: {
  vehicleId: Vehicle["id"];
  userId: User["id"];
  email: string;
}): Promise<InviteResult> {
  await requireVehicleOwner({ vehicleId, userId });
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter a valid email address");

  const db = await getDb();
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);

  if (existingUser) {
    const existingRole = await getVehicleRole({
      vehicleId,
      userId: existingUser.id,
    });
    if (existingRole) return { status: "already", email };
    await db
      .insert(vehicleMembers)
      .values({ vehicleId, userId: existingUser.id, role: "member" });
    return { status: "added", email };
  }

  const inserted = await db
    .insert(vehicleInvites)
    .values({ vehicleId, email, invitedById: userId })
    .onConflictDoNothing()
    .returning();
  return { status: inserted.length > 0 ? "invited" : "already", email };
}

export async function removeCrewMember({
  vehicleId,
  userId,
  memberUserId,
}: {
  vehicleId: Vehicle["id"];
  userId: User["id"];
  memberUserId: User["id"];
}): Promise<void> {
  await requireVehicleOwner({ vehicleId, userId });
  const db = await getDb();
  await db.delete(vehicleMembers).where(
    and(
      eq(vehicleMembers.vehicleId, vehicleId),
      eq(vehicleMembers.userId, memberUserId),
      eq(vehicleMembers.role, "member"), // never remove the owner row
    ),
  );
}

export async function revokeInvite({
  vehicleId,
  userId,
  inviteId,
}: {
  vehicleId: Vehicle["id"];
  userId: User["id"];
  inviteId: VehicleInvite["id"];
}): Promise<void> {
  await requireVehicleOwner({ vehicleId, userId });
  const db = await getDb();
  await db
    .delete(vehicleInvites)
    .where(
      and(
        eq(vehicleInvites.id, inviteId),
        eq(vehicleInvites.vehicleId, vehicleId),
      ),
    );
}

/**
 * Convert any pending invites for `email` into memberships. Called once at
 * signup; safe to call repeatedly.
 */
export async function claimPendingInvites({
  userId,
  email: rawEmail,
}: {
  userId: User["id"];
  email: string;
}): Promise<number> {
  const email = rawEmail.trim().toLowerCase();
  const db = await getDb();
  const pending = await db
    .select()
    .from(vehicleInvites)
    .where(
      and(eq(vehicleInvites.email, email), isNull(vehicleInvites.acceptedAt)),
    );
  if (pending.length === 0) return 0;

  await db.transaction(async (tx) => {
    for (const invite of pending) {
      await tx
        .insert(vehicleMembers)
        .values({ vehicleId: invite.vehicleId, userId, role: "member" })
        .onConflictDoNothing();
      await tx
        .update(vehicleInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(vehicleInvites.id, invite.id));
    }
  });
  return pending.length;
}
