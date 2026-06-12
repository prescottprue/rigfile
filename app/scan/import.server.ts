/**
 * Scan Bay — the one way a scanned receipt becomes data: a work log, the
 * original image attached to it, and (optionally) a follow-up reminder
 * drafted from the tech's recommended-work note. Shared by the batch CLI
 * (`scripts/scan-bay/import.ts`) and the in-app scan page so both paths get
 * identical records and the same crew-access checks (everything goes through
 * the model layer).
 */

import type { Reminder } from "~/db/schema";
import {
  addLogAttachment,
  type LogAttachment,
} from "~/models/attachment.server";
import { createLog, type Log } from "~/models/log.server";
import { findOrCreateMechanic } from "~/models/mechanic.server";
import { createReminder } from "~/models/reminder.server";
import { setVehicleVinIfMissing } from "~/models/vehicle.server";
import type { Storage } from "~/storage.server";

export type ScanFile = {
  body: Uint8Array;
  contentType: string;
  originalName?: string | null;
};

export async function createLogWithScan({
  userId,
  vehicleId,
  log,
  vendor,
  vehicleVin,
  scan,
  reminder,
  storage,
}: {
  userId: string;
  vehicleId: string;
  log: {
    title: string;
    notes?: string | null;
    type?: string | null;
    cost?: number | null;
    odometer?: number | null;
    /** Drop-off / work-start date, when the receipt shows one. */
    serviceStartedAt?: Date | null;
    /** Close/completion date (a single-date receipt fills only this). */
    servicedAt?: Date;
    selfService?: boolean;
  };
  /**
   * The shop that did the work (receipt's shopName). Linked to the log as a
   * find-or-create `mechanics` row so logs are filterable by vendor.
   */
  vendor?: { name: string; location?: string | null } | null;
  /**
   * VIN from the receipt — backfilled onto the vehicle only when it doesn't
   * already have one (never overwrites).
   */
  vehicleVin?: string | null;
  /** The captured/scanned image to attach. Omit to just create the log. */
  scan?: ScanFile | null;
  /** Draft a follow-up reminder (from the tech's recommended-work note). */
  reminder?: { title: string; notes: string | null } | null;
  /** Override the storage driver (tests). */
  storage?: Storage;
}): Promise<{
  log: Log;
  attachment: LogAttachment | null;
  reminder: Reminder | null;
}> {
  const mechanic = vendor?.name.trim()
    ? await findOrCreateMechanic(vendor)
    : null;

  if (vehicleVin?.trim()) {
    await setVehicleVinIfMissing({ vehicleId, userId, vin: vehicleVin });
  }

  const created = await createLog({
    userId,
    vehicleId,
    ...log,
    mechanicId: mechanic?.id ?? null,
  });

  const attachment = scan
    ? await addLogAttachment({
        logId: created.id,
        vehicleId,
        userId,
        body: scan.body,
        contentType: scan.contentType,
        originalName: scan.originalName,
        kind: "scan",
        ...(storage ? { storage } : {}),
      })
    : null;

  const createdReminder = reminder
    ? await createReminder({
        userId,
        vehicleId,
        title: reminder.title,
        notes: reminder.notes,
      })
    : null;

  return { log: created, attachment, reminder: createdReminder };
}
