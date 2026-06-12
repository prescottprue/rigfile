import { describe, expect, it } from "vitest";

import {
  type ExtractedReceipt,
  isValidVinCheckDigit,
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

  it("normalizes VINs and rejects anything that isn't a clean 17-char VIN", () => {
    expect(normalizeReceipt({ vin: "1c4hjxdg5mw612345" }).vin).toBe(
      "1C4HJXDG5MW612345",
    );
    // Separators stripped (shops print VINs with spaces/dashes).
    expect(normalizeReceipt({ vin: "1C4HJ XDG5-MW612 345" }).vin).toBe(
      "1C4HJXDG5MW612345",
    );
    // I/O/Q aren't in the VIN alphabet — likely a misread, so reject.
    expect(normalizeReceipt({ vin: "1C4HJXDG5MW61234O" }).vin).toBeNull();
    expect(normalizeReceipt({ vin: "TOO-SHORT" }).vin).toBeNull();
    expect(normalizeReceipt({}).vin).toBeNull();
  });

  it("validates VIN check digits (catches OCR-style misreads)", () => {
    // Valid: check digit (position 9) computed per ISO 3779.
    expect(isValidVinCheckDigit("1C4HJXDG9MW612345")).toBe(true);
    // The same VIN with "9" misread as "S" fails the checksum.
    expect(isValidVinCheckDigit("1C4HJXDGSMW612345")).toBe(false);
    expect(isValidVinCheckDigit("not a vin")).toBe(false);
  });

  it("puts a lone date in the close date and drops redundant start dates", () => {
    // Model misfiles a single date into the start slot → moved to close.
    const moved = normalizeReceipt({ serviceStartDate: "2026-05-02" });
    expect(moved.serviceDate).toBe("2026-05-02");
    expect(moved.serviceStartDate).toBeNull();

    // Two distinct dates pass through.
    const both = normalizeReceipt({
      serviceStartDate: "2026-05-01",
      serviceDate: "2026-05-02",
    });
    expect(both.serviceStartDate).toBe("2026-05-01");
    expect(both.serviceDate).toBe("2026-05-02");

    // Identical start/close collapses to close only.
    const same = normalizeReceipt({
      serviceStartDate: "2026-05-02",
      serviceDate: "2026-05-02",
    });
    expect(same.serviceStartDate).toBeNull();
    expect(same.serviceDate).toBe("2026-05-02");
  });
});

describe("receiptToNotes", () => {
  const base: ExtractedReceipt = {
    shopName: null,
    shopLocation: null,
    invoiceNumber: null,
    serviceDate: null,
    serviceStartDate: null,
    vehicle: null,
    vin: null,
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
