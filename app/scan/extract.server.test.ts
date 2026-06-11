import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractReceiptScan,
  isLicenseAgreementError,
  parseWorkersAiResponse,
} from "~/scan/extract.server";

describe("isLicenseAgreementError", () => {
  it("matches the Workers AI 5016 license-gate error", () => {
    // Verbatim shape seen in production (typo included).
    expect(
      isLicenseAgreementError(
        new Error(
          "5016: Prior to using this model you must sumbit the prompt " +
            "'agree'. By submitting 'agree', you hereby agree to the " +
            "llama-3.2-11b-vision-instruction Community License",
        ),
      ),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isLicenseAgreementError(new Error("3036: capacity"))).toBe(false);
    expect(isLicenseAgreementError(new Error("network timeout"))).toBe(false);
  });
});

describe("parseWorkersAiResponse", () => {
  it("passes through an already-parsed response object", () => {
    const obj = { suggestedTitle: "Oil change" };
    expect(parseWorkersAiResponse({ response: obj })).toBe(obj);
  });

  it("parses a JSON string response", () => {
    expect(
      parseWorkersAiResponse({ response: '{"suggestedTitle":"Brakes"}' }),
    ).toEqual({ suggestedTitle: "Brakes" });
  });

  it("strips markdown fencing before parsing", () => {
    expect(
      parseWorkersAiResponse({
        response: '```json\n{"suggestedTitle":"Tires"}\n```',
      }),
    ).toEqual({ suggestedTitle: "Tires" });
  });

  it("reads OpenAI-style choices content", () => {
    expect(
      parseWorkersAiResponse({
        choices: [{ message: { content: '{"odometer":84612}' } }],
      }),
    ).toEqual({ odometer: 84612 });
  });

  it("unwraps a nested response.content string", () => {
    expect(
      parseWorkersAiResponse({
        response: { content: '{"suggestedTitle":"Coolant flush"}' },
      }),
    ).toEqual({ suggestedTitle: "Coolant flush" });
  });

  it("digs JSON out of prose wrapping", () => {
    expect(
      parseWorkersAiResponse({
        response:
          'Here is the extracted data:\n{"totalCost":213,"odometer":84612}\nLet me know if you need anything else!',
      }),
    ).toEqual({ totalCost: 213, odometer: 84612 });
  });

  it("throws on empty or junk responses", () => {
    expect(() => parseWorkersAiResponse({})).toThrow("empty response");
    expect(() => parseWorkersAiResponse({ response: "not json" })).toThrow(
      "did not return valid JSON",
    );
  });
});

describe("extractReceiptScan (Node fallback)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to Ollama off-Workers and normalizes the result", async () => {
    // In vitest there is no `cloudflare:workers` module, so the seam must
    // route to the Ollama client — whose fetch we stub here.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          message: {
            content: JSON.stringify({
              shopName: "Desert 4x4",
              serviceDate: "2026-05-02",
              totalCost: "$213.00",
              lineItems: [{ description: "Front pads", total: 120 }],
              suggestedTitle: "Major service + brakes",
              recommendedWork: null,
            }),
          },
        }),
      ),
    );

    const receipt = await extractReceiptScan(new Uint8Array([1, 2, 3]));
    expect(receipt.shopName).toBe("Desert 4x4");
    expect(receipt.totalCost).toBe(213); // "$213.00" coerced by the normalizer
    expect(receipt.lineItems).toHaveLength(1);
  });

  it("surfaces a friendly error when no backend is reachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(extractReceiptScan(new Uint8Array([1]))).rejects.toThrow(
      "Receipt extraction is unavailable",
    );
  });
});
