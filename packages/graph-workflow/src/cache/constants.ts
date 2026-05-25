/**
 * Default TTL applied to `ActivityOutputCache` rows when none is provided.
 *
 * 24 hours, expressed in milliseconds. The worker decorator (US-132) uses this
 * when computing `expiresAt` for a fresh row; the GC sweep (US-134) deletes
 * rows whose `expiresAt < now()`.
 *
 * See `docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md` §2.2 (the cache schema
 * and TTL rationale).
 */
export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
