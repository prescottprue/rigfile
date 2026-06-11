/**
 * Scan Bay step 2 — import.
 *
 *   npm run scan:import -- <review.json> --vehicle <id> [--user <id>]
 *                            [--reminders]
 *
 * Reads a review file produced by `scan:extract` and, for each "pending"
 * entry, creates a log via the model layer (so crew-access checks apply),
 * stores the original scan as a log attachment, and — with --reminders —
 * drafts a reminder from the tech's recommended-work note.
 *
 * Idempotent: imported entries are stamped with their logId and status
 * "imported", and the review file is rewritten, so re-running skips them.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { eq } from "drizzle-orm";

import { getDb } from "~/db/client";
import { vehicles } from "~/db/schema";
import { createLogWithScan } from "~/scan/import.server.ts";
import { receiptToNotes } from "~/scan/receipt.ts";
import { contentTypeFor, type ReviewFile } from "./review.ts";

type Args = {
  reviewPath: string;
  vehicleId: string;
  userId?: string;
  reminders: boolean;
};

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let vehicleId: string | undefined;
  let userId: string | undefined;
  let reminders = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--vehicle") vehicleId = argv[++i];
    else if (arg === "--user") userId = argv[++i];
    else if (arg === "--reminders") reminders = true;
    else if (arg?.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else if (arg) positional.push(arg);
  }

  const reviewPath = positional[0];
  if (!reviewPath || !vehicleId) {
    throw new Error(
      "Usage: scan:import -- <review.json> --vehicle <id> [--user <id>] [--reminders]",
    );
  }
  return { reviewPath: resolve(reviewPath), vehicleId, userId, reminders };
}

/** Resolve the acting user — explicit --user, else the vehicle's owner. */
async function resolveUserId(
  vehicleId: string,
  explicit: string | undefined,
): Promise<string> {
  if (explicit) return explicit;
  const db = await getDb();
  const [vehicle] = await db
    .select({ userId: vehicles.userId })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId));
  if (!vehicle) throw new Error(`Vehicle ${vehicleId} not found`);
  return vehicle.userId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userId = await resolveUserId(args.vehicleId, args.userId);

  const raw = await readFile(args.reviewPath, "utf8");
  const review = JSON.parse(raw) as ReviewFile;
  const reviewDir = dirname(args.reviewPath);

  let imported = 0;
  let skipped = 0;

  for (const entry of review.entries) {
    if (entry.status !== "pending" || !entry.extracted) {
      skipped++;
      continue;
    }
    const r = entry.extracted;

    const scanPath = resolve(reviewDir, entry.file);
    const contentType =
      contentTypeFor(entry.file) ?? "application/octet-stream";
    const bytes = await readFile(scanPath);

    const { log } = await createLogWithScan({
      userId,
      vehicleId: args.vehicleId,
      log: {
        title: r.suggestedTitle,
        notes: receiptToNotes(r) || null,
        type: null,
        cost: r.totalCost,
        odometer: r.odometer,
        servicedAt: r.serviceDate ? new Date(r.serviceDate) : new Date(),
        selfService: false,
      },
      scan: {
        body: new Uint8Array(bytes),
        contentType,
        originalName: entry.file,
      },
      reminder:
        args.reminders && r.recommendedWork
          ? {
              title: `Follow-up: ${r.suggestedTitle}`,
              notes: r.recommendedWork,
            }
          : null,
    });

    entry.status = "imported";
    entry.logId = log.id;
    imported++;
    console.log(`  ✓ ${entry.file} → log ${log.id} (${r.suggestedTitle})`);
  }

  await writeFile(args.reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  console.log(
    `\n[import] ${imported} log(s) created, ${skipped} skipped. ` +
      `Updated ${args.reviewPath}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
