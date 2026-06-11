/**
 * Scan Bay — runtime-aware one-off extraction for in-app scans.
 *
 * On Cloudflare Workers the `AI` binding runs a vision model on the free
 * tier; on Node self-host we fall back to the same local Ollama setup the
 * batch CLI uses (OLLAMA_HOST / SCAN_MODEL). Both paths share the prompt +
 * JSON schema + normalizer from `~/scan/receipt`, so a phone capture and a
 * batch-scanned invoice extract identically.
 */

import { extractReceipt as extractWithOllama } from "~/scan/ollama.server";
import {
  EXTRACTION_PROMPT,
  type ExtractedReceipt,
  normalizeReceipt,
  RECEIPT_JSON_SCHEMA,
} from "~/scan/receipt";

/**
 * Vision model on Workers AI that supports both image input and JSON mode.
 * Override with a `SCAN_MODEL` Workers var (wrangler.jsonc `vars` or the
 * dashboard) — no deploy needed to swap models.
 */
const DEFAULT_WORKERS_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

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

  if (payload != null && typeof payload === "object") return payload;
  if (typeof payload === "string") {
    // Tolerate markdown fencing around the JSON body.
    const text = payload.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Workers AI did not return valid JSON: ${text.slice(0, 200)}`,
      );
    }
  }
  throw new Error("Workers AI returned an empty response");
}

/**
 * Extract a receipt from one image. Throws with a human-readable message
 * when no extraction backend is reachable — the scan page surfaces it and
 * lets the user fill the log in manually (the photo still gets attached).
 */
/**
 * Workers AI error 5016: Meta-licensed models require a one-time, per-account
 * license acceptance — submitting the literal prompt "agree" to the model.
 * Exported for tests.
 */
export function isLicenseAgreementError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b5016\b|prompt 'agree'|submit(?:ting)? 'agree'/i.test(message);
}

async function runWorkersAiExtraction(
  workersAi: { ai: WorkersAi; model: string },
  image: Uint8Array,
): Promise<ExtractedReceipt> {
  // The model's input schema takes the image as an array of 8-bit ints
  // alongside a plain prompt; JSON mode rides on response_format.
  const result = await workersAi.ai.run(workersAi.model, {
    prompt: EXTRACTION_PROMPT,
    image: Array.from(image),
    response_format: {
      type: "json_schema",
      json_schema: RECEIPT_JSON_SCHEMA,
    },
    temperature: 0,
    max_tokens: 1024,
  });
  return normalizeReceipt(parseWorkersAiResponse(result));
}

export async function extractReceiptScan(
  image: Uint8Array,
): Promise<ExtractedReceipt> {
  const workersAi = await getWorkersAi();
  let workersAiError: Error | null = null;

  if (workersAi) {
    try {
      return await runWorkersAiExtraction(workersAi, image);
    } catch (err) {
      if (isLicenseAgreementError(err)) {
        // First-ever call on this Cloudflare account: accept the Meta
        // license (one-time, per account) and retry the extraction.
        try {
          await workersAi.ai.run(workersAi.model, { prompt: "agree" });
          return await runWorkersAiExtraction(workersAi, image);
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
