/**
 * Temporal duration validation helpers shared by control-flow node forms.
 *
 * Used by `PollUntilNodeSettings` (`interval`, `initialDelay`, `timeout`) and
 * `HumanGateNodeSettings` (`timeout`). The Temporal duration string format
 * accepts integer counts followed by a unit suffix (`ms`, `s`, `m`, `h`, `d`)
 * and is allowed to chain segments (for example `30s`, `5m`, `1h30m`).
 *
 * The regex itself lives in `@ai-di/graph-workflow` (US-051) so the shared
 * `validateGraphConfig` surfaces the same error at save time. This module
 * just re-exports the helper and keeps the UI-specific help text.
 */

export { isValidTemporalDuration } from "@ai-di/graph-workflow";

/**
 * Help / description text suitable for the `description` prop on Mantine
 * inputs that accept a Temporal duration string. Kept short so it fits in
 * the right-rail node-settings panel.
 */
export const TEMPORAL_DURATION_HELP_TEXT =
  "Temporal duration, e.g. 30s, 5m, 1h, 1h30m, 250ms.";
