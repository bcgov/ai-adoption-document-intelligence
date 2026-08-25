/**
 * Retention policy for `ActivityOutputCache` rows.
 *
 * The worker decorator (US-132) uses this when computing `expiresAt` for a
 * fresh row; the GC sweep (US-134) deletes rows whose `expiresAt < now()`,
 * and `findFresh` filters `expiresAt <= now()` on read so expiry is correct
 * even when the (operator-started) sweep is not running.
 *
 * ## G-024 — why 14 days, not 24 hours
 *
 * The previous default was 24 h, which lands exactly on the most common
 * debugging situation there is: "the run happened yesterday". Opening a run
 * from the day before reliably found every intermediate value already gone.
 *
 * The cost of keeping them was measured rather than guessed, against the
 * development database:
 *
 *   - 24 rows, 128 kB total relation size (48 kB heap + 80 kB across four
 *     indexes — index overhead dominates at this scale, not payload).
 *   - `outputCtx` payload: avg 264 B, p95 335 B, max 335 B, 6.3 kB in total.
 *     Rows hold the node's ctx DELTA, and blob-backed values are stored as
 *     references, so payload size is bounded by ctx shape, not document size.
 *   - Marginal all-in cost of one row is roughly 0.6–0.8 kB (payload + heap
 *     tuple + four index entries).
 *
 * Crucially, rows are UPSERTed on
 * `(workflowLineageId, nodeId, configHash, inputHash)`. Re-running the same
 * graph on the same inputs refreshes a row rather than adding one, so the
 * table grows with distinct input sets, not with run count — the measured
 * database held 24 rows for ~12 run batches spread over six days.
 *
 * Extending 24 h → 14 d therefore multiplies a very small number: at the
 * observed rate the table would hold on the order of 10² rows / a few
 * hundred kB. Even a hundredfold busier installation stays in the tens of
 * megabytes.
 *
 * 14 days was chosen over the alternatives:
 *   - anything multi-day fixes the stated "yesterday" failure;
 *   - two weeks additionally covers the realistic worst case for a debugging
 *     session — coming back from a week away to look at what broke;
 *   - a longer ceiling (30 d+) buys little and matters more than it should
 *     for a table whose sweep is operator-started, so the growth bound stays
 *     short and predictable.
 *
 * Differential retention (shorter for previews, longer for a workflow's most
 * recent run, or "keep the last N runs regardless of age") was considered and
 * deliberately NOT built: the table has neither a run id nor a preview flag,
 * so any of those policies needs a schema change plus run identity threaded
 * through both write paths — a far larger change than the few hundred kB it
 * would save.
 *
 * See `docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md` §2.2.
 */
export const DEFAULT_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Environment variable that overrides {@link DEFAULT_CACHE_TTL_MS}, so the
 * retention window is tunable per environment without a deploy.
 */
export const CACHE_TTL_ENV_VAR = "ACTIVITY_OUTPUT_CACHE_TTL_MS";

/**
 * Resolve the cache TTL from an environment bag.
 *
 * The environment is passed in rather than read from `process.env` because
 * this module is part of the package's BROWSER entry point (`index.browser.ts`)
 * and must stay isomorphic. Node callers pass `process.env`.
 *
 * Falls back to {@link DEFAULT_CACHE_TTL_MS} for an absent, blank,
 * non-numeric, or non-positive value — a typo in a deployment variable must
 * not silently disable caching or make rows immortal.
 */
export function resolveCacheTtlMs(
  env: Readonly<Record<string, string | undefined>> = {},
): number {
  const raw = env[CACHE_TTL_ENV_VAR];
  if (raw === undefined || raw.trim() === "") return DEFAULT_CACHE_TTL_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CACHE_TTL_MS;
  return parsed;
}
