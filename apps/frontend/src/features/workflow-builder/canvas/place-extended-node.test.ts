/**
 * Tests for `nextNodePosition` — the pure helper that computes the
 * landing coordinates of a newly-extended node relative to its source
 * (US-045).
 */

import { describe, expect, it } from "vitest";
import { nextNodePosition } from "./place-extended-node";

describe("nextNodePosition", () => {
  it("defaults to 280px to the right of the source at the same y", () => {
    expect(nextNodePosition({ x: 100, y: 50 })).toEqual({ x: 380, y: 50 });
  });

  it("respects custom dx / dy overrides", () => {
    expect(nextNodePosition({ x: 100, y: 50 }, { dx: 320, dy: 40 })).toEqual({
      x: 420,
      y: 90,
    });
  });

  it("treats a missing override field as the default for that axis", () => {
    expect(nextNodePosition({ x: 0, y: 0 }, { dx: 100 })).toEqual({
      x: 100,
      y: 0,
    });
    expect(nextNodePosition({ x: 0, y: 0 }, { dy: 60 })).toEqual({
      x: 280,
      y: 60,
    });
  });
});
