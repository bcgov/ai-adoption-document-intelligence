/**
 * G-024 — the retention window must be tunable per environment without a
 * deploy, and a bad value must never silently disable caching or make rows
 * immortal.
 */

import {
  CACHE_TTL_ENV_VAR,
  DEFAULT_CACHE_TTL_MS,
  resolveCacheTtlMs,
} from "./constants";

describe("resolveCacheTtlMs", () => {
  it("defaults to a retention window that survives 'the run happened yesterday'", () => {
    const oneDay = 24 * 60 * 60 * 1000;
    expect(DEFAULT_CACHE_TTL_MS).toBeGreaterThan(oneDay);
    expect(DEFAULT_CACHE_TTL_MS).toBe(14 * oneDay);
    expect(resolveCacheTtlMs({})).toBe(DEFAULT_CACHE_TTL_MS);
    expect(resolveCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
  });

  it("honours a configured TTL", () => {
    expect(resolveCacheTtlMs({ [CACHE_TTL_ENV_VAR]: "3600000" })).toBe(
      3_600_000,
    );
  });

  it("keeps the configured retention for a run that would previously have expired", () => {
    // A row written 48h ago: dead under the old 24h default, alive now.
    const writtenAt = Date.now() - 48 * 60 * 60 * 1000;
    const expiresAt = writtenAt + resolveCacheTtlMs({});
    expect(expiresAt).toBeGreaterThan(Date.now());

    // And an operator who dials it down to 24h gets the old behaviour back.
    const shortExpiry =
      writtenAt +
      resolveCacheTtlMs({ [CACHE_TTL_ENV_VAR]: String(24 * 60 * 60 * 1000) });
    expect(shortExpiry).toBeLessThan(Date.now());
  });

  it.each([
    "",
    "   ",
    "not-a-number",
    "0",
    "-1",
  ])("falls back to the default for the unusable value %p", (value) => {
    expect(resolveCacheTtlMs({ [CACHE_TTL_ENV_VAR]: value })).toBe(
      DEFAULT_CACHE_TTL_MS,
    );
  });
});
