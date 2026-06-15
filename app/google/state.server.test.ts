import { beforeAll, describe, expect, it } from "vitest";

import { createState, verifyState } from "./state.server";

beforeAll(() => {
  process.env.SESSION_SECRET =
    "test-session-secret-at-least-32-characters-long";
});

describe("signed OAuth state", () => {
  it("verifies a fresh state for the same user", async () => {
    const state = await createState("user-1");
    expect(await verifyState(state, "user-1")).toBe(true);
  });

  it("rejects a state bound to a different user", async () => {
    const state = await createState("user-1");
    expect(await verifyState(state, "user-2")).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const state = await createState("user-1");
    const [payload] = state.split(".");
    expect(await verifyState(`${payload}.deadbeef`, "user-1")).toBe(false);
  });

  it("rejects null or malformed state", async () => {
    expect(await verifyState(null, "user-1")).toBe(false);
    expect(await verifyState("no-dot", "user-1")).toBe(false);
  });
});
