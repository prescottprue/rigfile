import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { User } from "~/db/schema";
import { passwords, users } from "~/db/schema";

export type { User };

export async function getUserById(id: User["id"]) {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserByEmail(email: User["email"]) {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ?? null;
}

export async function createUser(email: User["email"], password: string) {
  const db = await getDb();
  const hash = await bcrypt.hash(password, 10);
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email }).returning();
    if (!user) throw new Error("Failed to create user");
    await tx.insert(passwords).values({ userId: user.id, hash });
    return user;
  });
}

export async function deleteUserByEmail(email: User["email"]) {
  const db = await getDb();
  return db.delete(users).where(eq(users.email, email));
}

export async function verifyLogin(
  email: User["email"],
  password: string,
): Promise<User | null> {
  const db = await getDb();
  const row = await db
    .select({ user: users, hash: passwords.hash })
    .from(users)
    .innerJoin(passwords, eq(passwords.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  const record = row[0];
  if (!record) return null;

  const ok = await bcrypt.compare(password, record.hash);
  return ok ? record.user : null;
}
