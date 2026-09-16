-- Migrate any existing skipped sessions to abandoned (skip no longer has its own status)
UPDATE "review_sessions" SET status = 'abandoned'::"ReviewStatus" WHERE status = 'skipped'::"ReviewStatus";

-- Recreate the ReviewStatus enum: remove 'skipped', add 'flagged'
CREATE TYPE "ReviewStatus_new" AS ENUM ('in_progress', 'approved', 'escalated', 'flagged', 'abandoned');

-- Drop the default before altering the column type (Postgres cannot cast enum defaults automatically)
ALTER TABLE "review_sessions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "review_sessions" ALTER COLUMN "status" TYPE "ReviewStatus_new" USING ("status"::text::"ReviewStatus_new");
ALTER TABLE "review_sessions" ALTER COLUMN "status" SET DEFAULT 'in_progress'::"ReviewStatus_new";

DROP TYPE "ReviewStatus";
ALTER TYPE "ReviewStatus_new" RENAME TO "ReviewStatus";
