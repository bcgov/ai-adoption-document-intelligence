/**
 * Phase 6 Milestone C (US-169) — placeholder/index for the subprocess harness.
 *
 * The actual harness lives server-side in
 * `apps/deno-runner/src/subprocess-harness.ts` (Phase 6 Milestone A / US-186).
 * The worker is a thin HTTP client to the `deno-runner` service and never
 * spawns Deno directly, so it does NOT need its own harness — the runner
 * wraps the user script before spawning Deno.
 *
 * This file exists so the worker-side dynamic-nodes module has a clear
 * pointer to where the harness lives, and so future refactors that want to
 * share harness assembly can land their export here without churn elsewhere
 * in the codebase.
 */

export const SUBPROCESS_HARNESS_LOCATION =
  "apps/deno-runner/src/subprocess-harness.ts";
