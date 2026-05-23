/**
 * Temporal duration validation helpers shared by control-flow node forms.
 *
 * Used by `PollUntilNodeSettings` (`interval`, `initialDelay`, `timeout`) and
 * `HumanGateNodeSettings` (`timeout`). The Temporal duration string format
 * accepts integer counts followed by a unit suffix (`ms`, `s`, `m`, `h`, `d`)
 * and is allowed to chain segments (for example `30s`, `5m`, `1h30m`).
 *
 * This regex is intentionally permissive for UI-side inline-error feedback —
 * it accepts any non-empty chain of `<digits><unit>` segments. The backend
 * normalises and re-validates durations strictly at save time; matching this
 * pattern is necessary but not sufficient for backend acceptance.
 */

/**
 * Permissive Temporal duration regex used for inline UI validation.
 *
 * Matches one or more `<digits><unit>` segments back-to-back, where the unit
 * is one of `ms`, `s`, `m`, `h`, or `d`. Examples:
 *   - `30s`
 *   - `5m`
 *   - `1h`
 *   - `2d`
 *   - `1h30m`
 *   - `250ms`
 *
 * Does not accept:
 *   - empty string
 *   - whitespace
 *   - fractional values (e.g. `1.5s`)
 *   - bare numbers (e.g. `30`)
 *   - unknown units (e.g. `30x`)
 */
const TEMPORAL_DURATION_REGEX = /^(\d+(ms|s|m|h|d))+$/;

/**
 * Returns true when `value` is a non-empty string that matches the
 * UI-side Temporal duration grammar. See `TEMPORAL_DURATION_REGEX` for the
 * accepted shape and known limitations.
 */
export function isValidTemporalDuration(value: string): boolean {
  if (value.length === 0) return false;
  return TEMPORAL_DURATION_REGEX.test(value);
}

/**
 * Help / description text suitable for the `description` prop on Mantine
 * inputs that accept a Temporal duration string. Kept short so it fits in
 * the right-rail node-settings panel.
 */
export const TEMPORAL_DURATION_HELP_TEXT =
  "Temporal duration, e.g. 30s, 5m, 1h, 1h30m, 250ms.";
