/**
 * Scan Bay — runtime-aware one-off extraction for in-app scans.
 *
 * On Cloudflare Workers the `AI` binding runs a vision model on the free
 * tier; on Node self-host we fall back to the same local Ollama setup the
 * batch CLI uses (OLLAMA_HOST / SCAN_MODEL). Both paths share the prompt +
 * JSON schema + normalizer from `~/scan/receipt`, so a phone capture and a
 * batch-scanned invoice extract identically.
 */

import { Buffer } from "node:buffer";

import {
  extractReceipt as extractWithOllama,
  transcribeImage as transcribeWithOllama,
} from "~/scan/ollama.server";
import {
  EXTRACTION_PROMPT,
  type ExtractedReceipt,
  normalizeReceipt,
  RECEIPT_JSON_SCHEMA,
} from "~/scan/receipt";

/**
 * Vision model on Workers AI. Llama 4 Scout, verified live (2026-06): it
 * honors json_schema on busy multi-line-item receipts where
 * llama-3.2-11b-vision silently dropped to prose. Override with a
 * `SCAN_MODEL` Workers var (wrangler.jsonc `vars` or the dashboard) — no
 * deploy needed to swap models.
 */
const DEFAULT_WORKERS_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

type WorkersAi = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

/** Resolve the Workers AI binding, or null when not running on Workers. */
async function getWorkersAi(): Promise<{
  ai: WorkersAi;
  model: string;
} | null> {
  const cfModuleId = "cloudflare" + ":workers";
  // biome-ignore lint/suspicious/noExplicitAny: cross-runtime env shape
  const cf: any = await import(/* @vite-ignore */ cfModuleId).catch(() => null);
  const ai = cf?.env?.AI as WorkersAi | undefined;
  if (!ai || typeof ai.run !== "function") return null;
  const model =
    typeof cf.env.SCAN_MODEL === "string" && cf.env.SCAN_MODEL.length > 0
      ? cf.env.SCAN_MODEL
      : DEFAULT_WORKERS_MODEL;
  return { ai, model };
}

/**
 * Pull the model's JSON out of whatever shape `env.AI.run` returns. In JSON
 * mode the binding may hand back the object directly under `response`, a
 * JSON string, or an OpenAI-style `choices[0].message.content`. Exported for
 * tests.
 */
export function parseWorkersAiResponse(result: unknown): unknown {
  const r = (result && typeof result === "object" ? result : {}) as Record<
    string,
    unknown
  >;

  let payload: unknown = r.response;
  if (payload == null && Array.isArray(r.choices)) {
    const first = r.choices[0] as
      | { message?: { content?: unknown } }
      | undefined;
    payload = first?.message?.content;
  }

  if (payload != null && typeof payload === "object") {
    // Some response shapes nest the actual text one level deeper
    // (e.g. `{ response: { content: "…" } }`). Unwrap before giving up.
    const inner = (payload as Record<string, unknown>).content;
    if (typeof inner === "string") payload = inner;
    else return payload;
  }
  if (typeof payload === "string") {
    // Tolerate markdown fencing around the JSON body.
    const text = payload.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    try {
      return JSON.parse(text);
    } catch {
      // The model wrapped JSON in prose ("Here is the extracted data: {…}").
      // Take the outermost brace span and try that before failing.
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch {
          // fall through to the descriptive error below
        }
      }
      throw new Error(
        `Workers AI did not return valid JSON: ${text.slice(0, 200)}`,
      );
    }
  }
  throw new Error("Workers AI returned an empty response");
}

/**
 * Workers AI error 5016: Meta-licensed models require a one-time, per-account
 * license acceptance — submitting the literal prompt "agree" to the model.
 * Exported for tests.
 */
export function isLicenseAgreementError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b5016\b|prompt 'agree'|submit(?:ting)? 'agree'/i.test(message);
}

/** The raw text payload of an `env.AI.run` result, or null if not textual. */
function workersAiResponseText(result: unknown): string | null {
  const r = (result && typeof result === "object" ? result : {}) as Record<
    string,
    unknown
  >;
  let payload: unknown = r.response;
  if (payload == null && Array.isArray(r.choices)) {
    const first = r.choices[0] as
      | { message?: { content?: unknown } }
      | undefined;
    payload = first?.message?.content;
  }
  if (payload != null && typeof payload === "object") {
    const inner = (payload as Record<string, unknown>).content;
    if (typeof inner === "string") payload = inner;
  }
  return typeof payload === "string" ? payload : null;
}

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: RECEIPT_JSON_SCHEMA,
};

async function runWorkersAiExtraction(
  workersAi: { ai: WorkersAi; model: string },
  image: Uint8Array,
  contentType: string,
): Promise<ExtractedReceipt> {
  // Input shape verified against the live model (2026-06): the image must be
  // an `image_url` data-URL part *inside* the user message. A top-level
  // `image` next to `messages` is rejected (error 3030), and a bare `prompt`
  // routes to the image-to-text task. response_format is honored on this
  // chat form. The JSON nudge is belt-and-braces for runs where it isn't;
  // Ollama enforces the schema natively so it stays out of the shared
  // EXTRACTION_PROMPT.
  const dataUrl = `data:${contentType};base64,${Buffer.from(image).toString("base64")}`;
  const result = await workersAi.ai.run(workersAi.model, {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${EXTRACTION_PROMPT} Respond with only a JSON object — no prose.`,
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: RESPONSE_FORMAT,
    temperature: 0,
    // Generous headroom — a long line-itemed invoice that gets truncated
    // mid-JSON reads as "did not return valid JSON" to the parser.
    max_tokens: 2048,
  });

  try {
    return normalizeReceipt(parseWorkersAiResponse(result));
  } catch (parseErr) {
    // Vision models sometimes ignore response_format on busy images and
    // answer in prose — but the prose usually contains everything we asked
    // for. Run a text-only structuring pass, where JSON mode is reliable.
    const prose = workersAiResponseText(result);
    if (!prose) throw parseErr;
    // Surfaces in `wrangler tail` / Workers Logs for diagnosis.
    console.warn(
      `scan: vision response was not JSON, restructuring (${prose.length} chars): ` +
        prose.slice(0, 300),
    );
    const structured = await workersAi.ai.run(workersAi.model, {
      messages: [
        {
          role: "user",
          content:
            "Below is data extracted from an auto-shop receipt. Convert it " +
            "to a JSON object with fields: shopName, shopLocation, " +
            "invoiceNumber, serviceDate (YYYY-MM-DD), vehicle, odometer, " +
            "totalCost, lineItems (description/quantity/total), " +
            "suggestedTitle, recommendedWork. Use null for anything " +
            `missing. Respond with only the JSON object.\n\n${prose}`,
        },
      ],
      response_format: RESPONSE_FORMAT,
      temperature: 0,
      max_tokens: 2048,
    });
    return normalizeReceipt(parseWorkersAiResponse(structured));
  }
}

const TRANSCRIBE_PROMPT =
  "Transcribe every piece of text visible in this document image exactly as " +
  "written — names, dates, amounts, policy/VIN/plate numbers, addresses, and " +
  "any fine print. Output only the transcribed text, no commentary. If the " +
  "image contains no legible text, respond with an empty string.";

/**
 * Best-effort OCR for a vehicle document image, used to make scans
 * full-text searchable. Returns the transcribed text, or null when no vision
 * backend is reachable or the model returns nothing. Never throws: a failed
 * transcription just means the document is searchable by label/filename only,
 * so callers store the file regardless.
 */
export async function transcribeImage(
  image: Uint8Array,
  contentType = "image/jpeg",
): Promise<string | null> {
  const workersAi = await getWorkersAi();

  if (workersAi) {
    const dataUrl = `data:${contentType};base64,${Buffer.from(image).toString("base64")}`;
    const run = () =>
      workersAi.ai.run(workersAi.model, {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: TRANSCRIBE_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 2048,
      });
    try {
      const text = workersAiResponseText(await run());
      if (text?.trim()) return text.trim();
    } catch (err) {
      if (isLicenseAgreementError(err)) {
        try {
          await workersAi.ai.run(workersAi.model, { prompt: "agree" });
          const text = workersAiResponseText(await run());
          if (text?.trim()) return text.trim();
        } catch {
          // fall through to the Ollama attempt / null
        }
      }
    }
  }

  // Same reasoning as extractReceiptScan: localhost Ollama only exists on
  // Node self-host or local dev. On deployed Workers, skip it.
  const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  if (workersAi && !isDev) return null;

  try {
    const text = await transcribeWithOllama(image);
    return text?.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Extract a receipt from one image. Throws with a human-readable message
 * when no extraction backend is reachable — the scan page surfaces it and
 * lets the user fill the log in manually (the photo still gets attached).
 */
export async function extractReceiptScan(
  image: Uint8Array,
  contentType = "image/jpeg",
): Promise<ExtractedReceipt> {
  const workersAi = await getWorkersAi();
  let workersAiError: Error | null = null;

  if (workersAi) {
    try {
      return await runWorkersAiExtraction(workersAi, image, contentType);
    } catch (err) {
      if (isLicenseAgreementError(err)) {
        // First-ever call on this Cloudflare account: accept the Meta
        // license (one-time, per account) and retry the extraction.
        try {
          await workersAi.ai.run(workersAi.model, { prompt: "agree" });
          return await runWorkersAiExtraction(workersAi, image, contentType);
        } catch (retryErr) {
          workersAiError =
            retryErr instanceof Error ? retryErr : new Error(String(retryErr));
        }
      } else {
        // Don't give up yet — in dev the binding exists but remote bindings
        // may be off (CF_REMOTE_BINDINGS unset), and a local Ollama may be
        // running. On production Workers the Ollama attempt fails fast.
        workersAiError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  // The Ollama fallback only makes sense where localhost can exist: Node
  // self-host (no binding) and local dev (binding present, remote bindings
  // off). On deployed Workers a localhost fetch just bounces off Cloudflare
  // (403, error 1003) and buries the real error, so fail with the Workers
  // AI message directly.
  const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  if (workersAiError && !isDev) {
    throw new Error(
      `Receipt extraction failed (Workers AI: ${workersAiError.message})`,
    );
  }

  try {
    return await extractWithOllama(image);
  } catch (err) {
    const ollamaDetail = err instanceof Error ? err.message : String(err);
    if (workersAiError) {
      throw new Error(
        `Receipt extraction failed (Workers AI: ${workersAiError.message}; ` +
          `Ollama fallback: ${ollamaDetail})`,
      );
    }
    throw new Error(
      `Receipt extraction is unavailable (no Workers AI binding, and the ` +
        `local Ollama fallback failed: ${ollamaDetail})`,
    );
  }
}
