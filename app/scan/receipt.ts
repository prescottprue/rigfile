/**
 * Scan Bay — shared receipt-extraction contract.
 *
 * This module is deliberately isomorphic (no server/runtime imports) so the
 * exact same prompt + JSON schema drive both ingestion paths:
 *   1. the local batch CLI (Ollama `qwen3-vl`, `scripts/scan-bay/`), and
 *   2. the future in-app one-off scan (Cloudflare Workers AI binding).
 *
 * Keep the schema, the prompt, and `normalizeReceipt()` in lockstep — the
 * schema is what we hand the model's structured-output mode; normalize is the
 * trust-nothing pass we run on whatever comes back before it touches the DB.
 */

export type ExtractedLineItem = {
  description: string;
  quantity: number | null;
  total: number | null;
};

export type ExtractedReceipt = {
  shopName: string | null;
  shopLocation: string | null;
  invoiceNumber: string | null;
  /** ISO `YYYY-MM-DD`, or null when not legible. */
  serviceDate: string | null;
  /** Free-text vehicle description as printed on the invoice. */
  vehicle: string | null;
  odometer: number | null;
  totalCost: number | null;
  lineItems: ExtractedLineItem[];
  /** A short human title for the log, e.g. "Major service + brakes". */
  suggestedTitle: string;
  /** Tech notes about future/recommended work, e.g. "pads at 5mm". */
  recommendedWork: string | null;
};

/**
 * JSON Schema handed to the model's structured-output mode (`format` on
 * Ollama's `/api/chat`, or the response_format on Workers AI). Nullable fields
 * use the `["string", "null"]` union the local models honor most reliably.
 */
export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    shopName: { type: ["string", "null"] },
    shopLocation: { type: ["string", "null"] },
    invoiceNumber: { type: ["string", "null"] },
    serviceDate: { type: ["string", "null"] },
    vehicle: { type: ["string", "null"] },
    odometer: { type: ["number", "null"] },
    totalCost: { type: ["number", "null"] },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: ["number", "null"] },
          total: { type: ["number", "null"] },
        },
        required: ["description"],
      },
    },
    suggestedTitle: { type: "string" },
    recommendedWork: { type: ["string", "null"] },
  },
  required: [
    "shopName",
    "serviceDate",
    "totalCost",
    "lineItems",
    "suggestedTitle",
  ],
} as const;

export const EXTRACTION_PROMPT =
  "Extract the data from this auto-shop invoice/receipt. Use null for " +
  "anything not present. odometer should be the odometer-in reading if both " +
  "in/out are shown. totalCost is the final amount paid. serviceDate in " +
  "YYYY-MM-DD. recommendedWork captures any tech notes about future or " +
  "recommended service.";

/** Coerce a value to a finite number, or null. Strips `$`, commas, units. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Trim a string and collapse empty/whitespace-only to null. */
function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalize a date-ish value to ISO `YYYY-MM-DD`, or null if unparseable. */
function toIsoDate(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  // Already ISO-ish? Keep the date part verbatim — avoids TZ drift.
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return iso[1] ?? null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Defensive normalizer: takes whatever the model returned (already parsed
 * JSON) and produces a well-typed `ExtractedReceipt`. Never throws — missing
 * or malformed fields become null / empty so import can proceed and the human
 * can fill gaps. The only invented value is `suggestedTitle`, which falls back
 * to a generic label so every log has a title.
 */
export function normalizeReceipt(raw: unknown): ExtractedReceipt {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;

  const lineItems: ExtractedLineItem[] = Array.isArray(r.lineItems)
    ? r.lineItems
        .map((item) => {
          const it = (item && typeof item === "object" ? item : {}) as Record<
            string,
            unknown
          >;
          const description = toText(it.description);
          if (!description) return null;
          return {
            description,
            quantity: toNumber(it.quantity),
            total: toNumber(it.total),
          };
        })
        .filter((x): x is ExtractedLineItem => x !== null)
    : [];

  return {
    shopName: toText(r.shopName),
    shopLocation: toText(r.shopLocation),
    invoiceNumber: toText(r.invoiceNumber),
    serviceDate: toIsoDate(r.serviceDate),
    vehicle: toText(r.vehicle),
    odometer: toNumber(r.odometer),
    totalCost: toNumber(r.totalCost),
    lineItems,
    suggestedTitle: toText(r.suggestedTitle) ?? "Shop service",
    recommendedWork: toText(r.recommendedWork),
  };
}

/**
 * Compose a log's notes body from the extracted receipt — line items as a
 * bulleted list, plus shop/invoice provenance and any recommended work. Shared
 * by the importer so both ingestion paths render notes identically.
 */
export function receiptToNotes(receipt: ExtractedReceipt): string {
  const parts: string[] = [];

  if (receipt.lineItems.length > 0) {
    parts.push(
      receipt.lineItems
        .map((item) => {
          const qty = item.quantity != null ? `${item.quantity}× ` : "";
          const cost = item.total != null ? ` — $${item.total.toFixed(2)}` : "";
          return `• ${qty}${item.description}${cost}`;
        })
        .join("\n"),
    );
  }

  if (receipt.recommendedWork) {
    parts.push(`Recommended: ${receipt.recommendedWork}`);
  }

  const provenance: string[] = [];
  if (receipt.shopName) provenance.push(receipt.shopName);
  if (receipt.shopLocation) provenance.push(receipt.shopLocation);
  if (receipt.invoiceNumber)
    provenance.push(`Invoice ${receipt.invoiceNumber}`);
  if (provenance.length > 0) parts.push(provenance.join(" · "));

  return parts.join("\n\n");
}
