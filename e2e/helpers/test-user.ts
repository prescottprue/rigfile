import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { passwords, users } from "../../app/db/schema";

function getTestDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set for e2e tests");
  const sql = postgres(url);
  return drizzle(sql);
}

export async function createTestUser(email: string, password: string) {
  if (!email.endsWith("@example.com")) {
    throw new Error("Test emails must end with @example.com");
  }
  const db = getTestDb();
  const hash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(users).values({ email }).returning();
  if (!user) throw new Error("Failed to create test user");
  await db.insert(passwords).values({ userId: user.id, hash });
  return user;
}

export async function deleteTestUser(email: string) {
  if (!email.endsWith("@example.com")) {
    throw new Error("Test emails must end with @example.com");
  }
  const db = getTestDb();
  await db.delete(users).where(eq(users.email, email));
}
