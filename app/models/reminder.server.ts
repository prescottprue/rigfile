import { and, eq } from "drizzle-orm";

import { getDb } from "~/db/client";
import type { NewReminder, Reminder } from "~/db/schema";
import { reminders } from "~/db/schema";
import { getLatestOdometer } from "~/models/log.server";
import { requireVehicleAccess } from "~/models/member.server";

export type { Reminder };

export type ReminderStatus = "overdue" | "due_soon" | "ok" | "done";

export type ReminderWithStatus = Reminder & {
  status: ReminderStatus;
  /** Days until dueDate; negative when past due. Null if no dueDate. */
  daysLeft: number | null;
  /** Miles until dueMiles based on latest logged odometer. Null if unknowable. */
  milesLeft: number | null;
};

export const DUE_SOON_DAYS = 30;
export const DUE_SOON_MILES = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure status computation so it's unit-testable. A reminder is overdue if
 * EITHER its date or mileage threshold has been crossed (whichever comes
 * first wins — that's how service intervals work).
 */
export function computeReminderStatus(
  reminder: Pick<Reminder, "dueDate" | "dueMiles" | "completedAt">,
  currentOdometer: number | null,
  now: Date = new Date(),
): Pick<ReminderWithStatus, "status" | "daysLeft" | "milesLeft"> {
  if (reminder.completedAt) {
    return { status: "done", daysLeft: null, milesLeft: null };
  }
  const daysLeft =
    reminder.dueDate != null
      ? Math.ceil((reminder.dueDate.getTime() - now.getTime()) / DAY_MS)
      : null;
  const milesLeft =
    reminder.dueMiles != null && currentOdometer != null
      ? reminder.dueMiles - currentOdometer
      : null;

  if (
    (daysLeft != null && daysLeft <= 0) ||
    (milesLeft != null && milesLeft <= 0)
  ) {
    return { status: "overdue", daysLeft, milesLeft };
  }
  if (
    (daysLeft != null && daysLeft <= DUE_SOON_DAYS) ||
    (milesLeft != null && milesLeft <= DUE_SOON_MILES)
  ) {
    return { status: "due_soon", daysLeft, milesLeft };
  }
  return { status: "ok", daysLeft, milesLeft };
}

const STATUS_ORDER: Record<ReminderStatus, number> = {
  overdue: 0,
  due_soon: 1,
  ok: 2,
  done: 3,
};

export async function listReminders({
  vehicleId,
  userId,
}: {
  vehicleId: Reminder["vehicleId"];
  userId: string;
}): Promise<ReminderWithStatus[]> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const rows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.vehicleId, vehicleId));
  const odometer = await getLatestOdometer({ vehicleId });

  return rows
    .map((r) => ({ ...r, ...computeReminderStatus(r, odometer) }))
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      // Within a status bucket, most urgent first (fewest days, then miles).
      const aKey = a.daysLeft ?? a.milesLeft ?? Number.MAX_SAFE_INTEGER;
      const bKey = b.daysLeft ?? b.milesLeft ?? Number.MAX_SAFE_INTEGER;
      return aKey - bKey;
    });
}

export async function getReminder({
  id,
  vehicleId,
  userId,
}: {
  id: Reminder["id"];
  vehicleId: Reminder["vehicleId"];
  userId: string;
}): Promise<Reminder | null> {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.vehicleId, vehicleId)));
  return reminder ?? null;
}

export async function createReminder(
  input: NewReminder & { userId: string },
): Promise<Reminder> {
  const { userId, ...values } = input;
  await requireVehicleAccess({ vehicleId: values.vehicleId, userId });
  const db = await getDb();
  const [reminder] = await db
    .insert(reminders)
    .values({ ...values, createdById: userId })
    .returning();
  if (!reminder) throw new Error("Failed to create reminder");
  return reminder;
}

/**
 * Mark a reminder done. Recurring reminders (interval set) roll forward:
 * next due date = now + intervalMonths, next due miles = the odometer at
 * completion + intervalMiles. One-shot reminders get completedAt set.
 */
export async function completeReminder({
  id,
  vehicleId,
  userId,
  odometer,
}: {
  id: Reminder["id"];
  vehicleId: Reminder["vehicleId"];
  userId: string;
  odometer?: number | null;
}): Promise<Reminder | null> {
  const reminder = await getReminder({ id, vehicleId, userId });
  if (!reminder) return null;

  const db = await getDb();
  const recurring =
    reminder.intervalMonths != null || reminder.intervalMiles != null;

  if (!recurring) {
    const [updated] = await db
      .update(reminders)
      .set({ completedAt: new Date() })
      .where(eq(reminders.id, id))
      .returning();
    return updated ?? null;
  }

  let nextDueDate: Date | null = null;
  if (reminder.intervalMonths != null) {
    nextDueDate = new Date();
    nextDueDate.setMonth(nextDueDate.getMonth() + reminder.intervalMonths);
  }
  let nextDueMiles: number | null = null;
  if (reminder.intervalMiles != null) {
    const base = odometer ?? (await getLatestOdometer({ vehicleId }));
    nextDueMiles =
      base != null
        ? base + reminder.intervalMiles
        : (reminder.dueMiles ?? 0) + reminder.intervalMiles;
  }

  const [updated] = await db
    .update(reminders)
    .set({ dueDate: nextDueDate, dueMiles: nextDueMiles, completedAt: null })
    .where(eq(reminders.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteReminder({
  id,
  vehicleId,
  userId,
}: {
  id: Reminder["id"];
  vehicleId: Reminder["vehicleId"];
  userId: string;
}) {
  await requireVehicleAccess({ vehicleId, userId });
  const db = await getDb();
  return db
    .delete(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.vehicleId, vehicleId)));
}
