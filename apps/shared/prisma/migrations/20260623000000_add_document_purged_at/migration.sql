-- AlterTable
-- Tracks when the ephemeral-document cleanup janitor purged a document's blobs
-- and Temporal execution record. NULL = not yet purged.
ALTER TABLE "documents" ADD COLUMN "purged_at" TIMESTAMP(3);
