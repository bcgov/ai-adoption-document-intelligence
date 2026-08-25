/**
 * Shared Temporal duration validation (US-051).
 *
 * Pure helper used by the graph workflow validator on `pollUntil.interval`,
 * `pollUntil.initialDelay`, `pollUntil.timeout`, and `humanGate.timeout`.
 * Re-exported through the frontend's `duration-validation.ts` so node-
 * settings forms surface the same inline error the validator uses.
 *
 * The accepted shape is one or more `<digits><unit>` segments back-to-back,
 * where the unit is one of `ms`, `s`, `m`, `h`, `d` (e.g. `30s`, `5m`,
 * `1h30m`, `250ms`). The pattern rejects empty strings, whitespace,
 * fractional values, bare numbers, and unknown units.
 *
 * The regex is permissive (UI-side feedback grammar). The Temporal SDK
 * normalises and strictly re-validates at runtime — matching this pattern
 * is necessary but not sufficient for runtime acceptance.
 */

const TEMPORAL_DURATION_REGEX = /^(\d+(ms|s|m|h|d))+$/;

/**
 * Returns `true` when `value` is a non-empty string matching the shared
 * Temporal duration grammar. Returns `false` for empty strings and
 * `undefined` so callers can pass optional fields without a null check.
 */
export function isValidTemporalDuration(value: string | undefined): boolean {
  if (value === undefined) return false;
  if (value.length === 0) return false;
  return TEMPORAL_DURATION_REGEX.test(value);
}
