import { describe, expect, it } from "vitest";

import {
  type ExtractedReceipt,
  normalizeReceipt,
  receiptToNotes,
} from "~/scan/receipt";

describe("normalizeReceipt", () => {
  it("passes through a well-formed receipt", () => {
    const result = normalizeReceipt({
      shopName: "Joe's Auto",
      shopLocation: "Reno, NV",
      invoiceNumber: "A-1234",
      serviceDate: "2026-01-15",
      vehicle: "2018 Jeep Wrangler",
      odometer: 48210,
      totalCost: 412.55,
      lineItems: [
        { description: "Synthetic oil change", quantity: 1, total: 89.99 },
        { description: "Brake inspection", quantity: 1, total: 0 },
      ],
      suggestedTitle: "Oil change + brake inspection",
      recommendedWork: "Front pads at 5mm, replace in ~5k mi",
    });

    expect(result.shopName).toBe("Joe's Auto");
    expect(result.odometer).toBe(48210);
    expect(result.totalCost).toBe(412.55);
    expect(result.lineItems).toHaveLength(2);
    expect(result.serviceDate).toBe("2026-01-15");
  });

  it("coerces money/odometer strings with symbols and commas", () => {
    const result = normalizeReceipt({
      odometer: "48,210 mi",
      totalCost: "$1,299.00",
      suggestedTitle: "Major service",
      lineItems: [{ description: "Timing belt", total: "$899.00" }],
    });

    expect(result.odometer).toBe(48210);
    expect(result.totalCost).toBe(1299);
    expect(result.lineItems[0]?.total).toBe(899);
  });

  it("nulls out empty/whitespace strings and unparseable numbers", () => {
    const result = normalizeReceipt({
      shopName: "   ",
      odometer: "n/a",
      totalCost: null,
      suggestedTitle: "Service",
      lineItems: [],
    });

    expect(result.shopName).toBeNull();
    expect(result.odometer).toBeNull();
    expect(result.totalCost).toBeNull();
  });

  it("drops line items without a description", () => {
    const result = normalizeReceipt({
      suggestedTitle: "Service",
      lineItems: [
        { description: "Air filter", total: 24 },
        { description: "", total: 10 },
        { total: 99 },
        "garbage",
      ],
    });

    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]?.description).toBe("Air filter");
  });

  it("normalizes non-ISO dates to YYYY-MM-DD and keeps the date part of ISO", () => {
    expect(
      normalizeReceipt({ serviceDate: "2026-03-09T00:00:00Z" }).serviceDate,
    ).toBe("2026-03-09");
    expect(normalizeReceipt({ serviceDate: "01/15/2026" }).serviceDate).toBe(
      "2026-01-15",
    );
    expect(
      normalizeReceipt({ serviceDate: "not a date" }).serviceDate,
    ).toBeNull();
  });

  it("never throws on junk and always supplies a title", () => {
    expect(normalizeReceipt(null).suggestedTitle).toBe("Shop service");
    expect(normalizeReceipt(undefined).lineItems).toEqual([]);
    expect(normalizeReceipt("string").suggestedTitle).toBe("Shop service");
    expect(normalizeReceipt({ suggestedTitle: 42 }).suggestedTitle).toBe(
      "Shop service",
    );
  });
});

describe("receiptToNotes", () => {
  const base: ExtractedReceipt = {
    shopName: null,
    shopLocation: null,
    invoiceNumber: null,
    serviceDate: null,
    vehicle: null,
    odometer: null,
    totalCost: null,
    lineItems: [],
    suggestedTitle: "Service",
    recommendedWork: null,
  };

  it("renders line items, recommended work, and provenance", () => {
    const notes = receiptToNotes({
      ...base,
      shopName: "Joe's Auto",
      shopLocation: "Reno, NV",
      invoiceNumber: "A-1234",
      lineItems: [
        { description: "Oil change", quantity: 1, total: 89.99 },
        { description: "Wiper blades", quantity: 2, total: 24 },
      ],
      recommendedWork: "Rotate tires next visit",
    });

    expect(notes).toContain("• 1× Oil change — $89.99");
    expect(notes).toContain("• 2× Wiper blades — $24.00");
    expect(notes).toContain("Recommended: Rotate tires next visit");
    expect(notes).toContain("Joe's Auto · Reno, NV · Invoice A-1234");
  });

  it("returns an empty string when there's nothing to say", () => {
    expect(receiptToNotes(base)).toBe("");
  });
});
