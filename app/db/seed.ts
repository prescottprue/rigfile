import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { createDb } from "./client";
import { passwords, users, vehicles } from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to seed");
  }
  const { db, close } = createDb(url);

  const email = "scott@example.com";
  const plain = "scottiscool";

  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing.length > 0) {
    console.log(`[seed] user ${email} already exists — skipping`);
    await close();
    return;
  }

  const hash = await bcrypt.hash(plain, 10);

  const [user] = await db.insert(users).values({ email }).returning();
  if (!user) throw new Error("Failed to create seed user");
  await db.insert(passwords).values({ userId: user.id, hash });

  await db.insert(vehicles).values({
    userId: user.id,
    make: "Subaru",
    model: "WRX",
    year: 2007,
  });

  console.log(`[seed] created ${email} and one vehicle`);
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
