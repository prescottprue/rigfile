import { describe, expect, it } from "vitest";

import {
  defaultQuad,
  distance,
  orderCorners,
  type Point,
  quadOutputSize,
} from "~/lib/document-scan";

describe("orderCorners", () => {
  it("orders scrambled corners as tl, tr, br, bl", () => {
    const tl: Point = { x: 1, y: 1 };
    const tr: Point = { x: 9, y: 1 };
    const br: Point = { x: 9, y: 7 };
    const bl: Point = { x: 1, y: 7 };
    // Hand them in a deliberately wrong order.
    expect(orderCorners([br, bl, tr, tl])).toEqual([tl, tr, br, bl]);
  });

  it("handles a sheared (perspective) quad", () => {
    // Top edge narrower than the bottom — a page shot from an angle.
    const tl: Point = { x: 30, y: 10 };
    const tr: Point = { x: 70, y: 12 };
    const br: Point = { x: 95, y: 90 };
    const bl: Point = { x: 5, y: 88 };
    expect(orderCorners([tr, br, tl, bl])).toEqual([tl, tr, br, bl]);
  });

  it("throws when given fewer than four points", () => {
    expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow();
  });
});

describe("distance", () => {
  it("is the euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("quadOutputSize", () => {
  it("takes the longer of each opposing edge pair", () => {
    const quad = orderCorners([
      { x: 1, y: 1 },
      { x: 9, y: 1 },
      { x: 9, y: 7 },
      { x: 1, y: 7 },
    ]);
    expect(quadOutputSize(quad)).toEqual({ width: 8, height: 6 });
  });
});

describe("defaultQuad", () => {
  it("is an inset rectangle in fractional coordinates", () => {
    const [tl, tr, br, bl] = defaultQuad(0.1);
    expect(tl).toEqual({ x: 0.1, y: 0.1 });
    expect(tr).toEqual({ x: 0.9, y: 0.1 });
    expect(br).toEqual({ x: 0.9, y: 0.9 });
    expect(bl).toEqual({ x: 0.1, y: 0.9 });
  });
});
