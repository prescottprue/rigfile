/**
 * Scan Bay — the review-file format that bridges the two CLI steps.
 *
 * `scan` writes one of these; a human eyeballs/edits it (fix a date, flip an
 * entry's status to "skip"); then `import` reads it and creates the logs. The
 * file is intentionally plain JSON so it's easy to hand-correct.
 */

import { extname } from "node:path";

import type { ExtractedReceipt } from "~/scan/receipt.ts";

export type ReviewStatus = "pending" | "skip" | "imported";

export type ReviewEntry = {
  /** Path to the scan, relative to the review file's directory. */
  file: string;
  status: ReviewStatus;
  /** Extraction error, when the model/transport failed for this file. */
  error?: string;
  /** Set by `import` once the log exists, so re-runs don't duplicate. */
  logId?: string;
  extracted: ExtractedReceipt | null;
};

export type ReviewFile = {
  version: 1;
  createdAt: string;
  sourceDir: string;
  model: string;
  entries: ReviewEntry[];
};

/** Image extensions the vision model can read. PDFs aren't supported. */
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

export const SCAN_EXTENSIONS = Object.keys(CONTENT_TYPES);

export function contentTypeFor(file: string): string | null {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? null;
}

export function isScannable(file: string): boolean {
  return contentTypeFor(file) !== null;
}
