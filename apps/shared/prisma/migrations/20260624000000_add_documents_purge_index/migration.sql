-- Partial index supporting the ephemeral-document cleanup janitor's scan
-- (findPurgeableEphemeralDocuments). Only UNPURGED rows are indexed, so the
-- index stays small regardless of total table size: purged rows dominate over
-- time and the janitor clears new terminal docs within ~1 minute, so the
-- unpurged working set is bounded by throughput, not by table size.
--
-- Prisma cannot express partial (filtered) indexes in schema.prisma, so this
-- index is managed here. Keep it in sync manually if the janitor query changes.
--
-- NOTE: built without CONCURRENTLY so it runs inside the Prisma migration
-- transaction. For an already-large `documents` table in production, build it
-- out-of-band with CREATE INDEX CONCURRENTLY to avoid a write lock.
CREATE INDEX IF NOT EXISTS "documents_purge_scan_idx"
  ON "documents" ("workflow_config_id", "status")
  WHERE "purged_at" IS NULL;
