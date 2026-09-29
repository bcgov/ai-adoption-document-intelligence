/**
 * Tests for the shared Temporal duration validation util used by
 * `PollUntilNodeSettings` (US-008) and `HumanGateNodeSettings` (US-009).
 */

import { describe, expect, it } from "vitest";
import {
  isValidTemporalDuration,
  TEMPORAL_DURATION_HELP_TEXT,
} from "./duration-validation";

describe("isValidTemporalDuration", () => {
  it.each([
    "30s",
    "5m",
    "1h",
    "2d",
    "250ms",
    "1h30m",
    "1d2h30m",
    "1h30m15s",
    "100ms500ms",
  ])("accepts %p", (value) => {
    expect(isValidTemporalDuration(value)).toBe(true);
  });

  it.each([
    "",
    "abc",
    "30",
    " 30s",
    "30s ",
    "30 s",
    "1.5s",
    "-30s",
    "30x",
    "1h30",
    "h30",
  ])("rejects %p", (value) => {
    expect(isValidTemporalDuration(value)).toBe(false);
  });
});

describe("TEMPORAL_DURATION_HELP_TEXT", () => {
  it("is a non-empty string suitable for use as input description text", () => {
    expect(typeof TEMPORAL_DURATION_HELP_TEXT).toBe("string");
    expect(TEMPORAL_DURATION_HELP_TEXT.length).toBeGreaterThan(0);
  });
});
