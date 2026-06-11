/**
 * Scan Bay — local extraction via Ollama's `/api/chat` with structured output.
 *
 * Deliberately NOT the Anthropic API: this runs against a local vision model
 * (default `qwen3-vl:8b`) so digitizing Scott's paper invoice backlog costs
 * $0. The schema + prompt come from the shared `~/scan/receipt` contract so
 * the in-app Workers AI path can extract identically later.
 */

import { Buffer } from "node:buffer";

import {
  EXTRACTION_PROMPT,
  type ExtractedReceipt,
  normalizeReceipt,
  RECEIPT_JSON_SCHEMA,
} from "~/scan/receipt.ts";

export type OllamaConfig = {
  host: string;
  model: string;
};

export const DEFAULT_OLLAMA: OllamaConfig = {
  host: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  model: process.env.SCAN_MODEL ?? "qwen3-vl:8b",
};

type OllamaChatResponse = {
  message?: { content?: string };
  error?: string;
};

/**
 * Run one image through the model and return a normalized receipt. Throws on
 * transport/model errors; the caller decides how to record a failed scan.
 */
export async function extractReceipt(
  image: Uint8Array,
  config: OllamaConfig = DEFAULT_OLLAMA,
): Promise<ExtractedReceipt> {
  const base64 = Buffer.from(image).toString("base64");

  const res = await fetch(`${config.host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [
        { role: "user", content: EXTRACTION_PROMPT, images: [base64] },
      ],
      format: RECEIPT_JSON_SCHEMA,
      options: { temperature: 0 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Ollama ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }

  const data = (await res.json()) as OllamaChatResponse;
  if (data.error) throw new Error(`Ollama error: ${data.error}`);

  const content = data.message?.content;
  if (!content) throw new Error("Ollama returned an empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      `Model did not return valid JSON: ${content.slice(0, 200)}`,
    );
  }

  return normalizeReceipt(parsed);
}
