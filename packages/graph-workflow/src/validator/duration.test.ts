/**
 * Tests for the shared Temporal duration validator (US-051).
 *
 * Lifted from the frontend's `duration-validation.test.ts` so the shared
 * `validateGraphConfig` can call the same regex on `pollUntil.interval`,
 * `pollUntil.initialDelay`, `pollUntil.timeout`, and `humanGate.timeout`.
 */

import { isValidTemporalDuration } from "./duration";

describe("isValidTemporalDuration", () => {
  it.each(["5s", "1h30m", "500ms"])("accepts %p", (value) => {
    expect(isValidTemporalDuration(value)).toBe(true);
  });

  it.each(["", "-1s", "5", "5.5s"])("rejects %p", (value) => {
    expect(isValidTemporalDuration(value)).toBe(false);
  });

  it("rejects undefined defensively", () => {
    expect(isValidTemporalDuration(undefined)).toBe(false);
  });
});
