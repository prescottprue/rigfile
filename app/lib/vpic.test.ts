import { describe, expect, it } from "vitest";

import { buildEngineString } from "~/lib/vpic";

describe("buildEngineString", () => {
  it("builds a V6 with displacement and engine model", () => {
    expect(
      buildEngineString({
        DisplacementL: "3.6",
        EngineCylinders: "6",
        EngineConfiguration: "V-Shaped",
        EngineModel: "Pentastar",
      }),
    ).toBe("3.6L V6 Pentastar");
  });

  it("builds an inline-4 turbo", () => {
    expect(
      buildEngineString({
        DisplacementL: "2.0",
        EngineCylinders: "4",
        EngineConfiguration: "In-Line",
        Turbo: "Yes",
      }),
    ).toBe("2.0L I4 Turbo");
  });

  it("handles missing configuration with a cylinder-count fallback", () => {
    expect(
      buildEngineString({ DisplacementL: "5.7", EngineCylinders: "8" }),
    ).toBe("5.7L 8-cyl");
  });

  it("skips 'Not Applicable' engine models and empty fields", () => {
    expect(buildEngineString({ EngineModel: "Not Applicable" })).toBe("");
    expect(buildEngineString({})).toBe("");
  });
});
