-- Indexes backing the documents list endpoint (DocumentController.getAllDocuments).
-- The endpoint filters by group_id, orders by created_at DESC, paginates, and
-- supports an ILIKE search over title / original_filename.

-- 1. Composite index for the default access pattern: filter by group_id, order
--    by created_at DESC, limit/offset. Declared in schema.prisma; created here
--    with the matching DESC ordering so Postgres can return rows in index order
--    and satisfy LIMIT without sorting the group's whole row set.
CREATE INDEX IF NOT EXISTS "documents_group_id_created_at_idx"
  ON "documents" ("group_id", "created_at" DESC);

-- 2. Trigram GIN indexes for the ILIKE '%term%' search. A leading-wildcard
--    ILIKE cannot use a B-tree index, so without these it sequentially scans the
--    group's rows. gin_trgm_ops supports both LIKE and ILIKE. Prisma cannot
--    express GIN/trigram indexes, so they are managed in this migration.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "documents_title_trgm_idx"
  ON "documents" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "documents_original_filename_trgm_idx"
  ON "documents" USING GIN ("original_filename" gin_trgm_ops);

-- NOTE: all three are built without CONCURRENTLY so they run inside the Prisma
-- migration transaction. For an already-large `documents` table in production,
-- build them out-of-band with CREATE INDEX CONCURRENTLY to avoid a write lock.
