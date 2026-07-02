-- AlterTable: add max_array_items_assumption with a default so existing rows are backfilled,
-- then drop the default to keep the column NOT NULL without a permanent default.
-- Trigram GIN indexes are intentionally preserved (managed outside Prisma schema).
ALTER TABLE "rate_versions" ADD COLUMN "max_array_items_assumption" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "rate_versions" ALTER COLUMN "max_array_items_assumption" DROP DEFAULT;
