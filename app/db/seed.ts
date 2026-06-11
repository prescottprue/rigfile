import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { createDb } from "./client";
import {
  logs,
  passwords,
  projectItems,
  projects,
  reminders,
  users,
  vehicleMembers,
  vehicles,
} from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const [vehicle] = await db
    .insert(vehicles)
    .values({
      userId: user.id,
      make: "Subaru",
      model: "WRX",
      year: 2007,
      name: "Rally Car",
    })
    .returning();
  if (!vehicle) throw new Error("Failed to create seed vehicle");
  await db.insert(vehicleMembers).values({
    vehicleId: vehicle.id,
    userId: user.id,
    role: "owner",
  });

  await db.insert(logs).values({
    userId: user.id,
    vehicleId: vehicle.id,
    title: "Oil change",
    notes: "5W-30 synthetic, OEM filter",
    type: "Minor",
    odometer: 98200,
    cost: 64.5,
    selfService: true,
    servicedAt: new Date(Date.now() - 20 * DAY_MS),
  });

  await db.insert(reminders).values([
    {
      vehicleId: vehicle.id,
      title: "Oil change",
      notes: "5W-30 synthetic",
      dueMiles: 103200,
      intervalMiles: 5000,
      intervalMonths: 6,
      dueDate: new Date(Date.now() + 160 * DAY_MS),
      createdById: user.id,
    },
    {
      vehicleId: vehicle.id,
      title: "Front brake pads",
      dueMiles: 98700,
      createdById: user.id,
    },
  ]);

  const [project] = await db
    .insert(projects)
    .values({
      vehicleId: vehicle.id,
      title: "Rally prep",
      description: "Service + spares before the next event",
      status: "planned",
      targetDate: new Date(Date.now() + 45 * DAY_MS),
      createdById: user.id,
    })
    .returning();
  if (project) {
    await db.insert(projectItems).values([
      {
        projectId: project.id,
        name: "Hawk DTC-30 front pads",
        price: 189,
        quantity: 1,
        status: "proposed",
      },
      {
        projectId: project.id,
        name: "Spare gravel tires",
        price: 140,
        quantity: 2,
        status: "ordered",
      },
    ]);
  }

  console.log(
    `[seed] created ${email} with vehicle, log, reminders, and a project`,
  );
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
