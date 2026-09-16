-- Escalation was folded into the flagged status, which carries the same meaning:
-- a document a reviewer set aside for someone else to look at.
UPDATE "review_sessions" SET status = 'flagged'::"ReviewStatus" WHERE status = 'escalated'::"ReviewStatus";

-- Recreate the ReviewStatus enum without 'escalated'
CREATE TYPE "ReviewStatus_new" AS ENUM ('in_progress', 'approved', 'flagged', 'abandoned');

-- Drop the default before altering the column type (Postgres cannot cast enum defaults automatically)
ALTER TABLE "review_sessions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "review_sessions" ALTER COLUMN "status" TYPE "ReviewStatus_new" USING ("status"::text::"ReviewStatus_new");
ALTER TABLE "review_sessions" ALTER COLUMN "status" SET DEFAULT 'in_progress'::"ReviewStatus_new";

DROP TYPE "ReviewStatus";
ALTER TYPE "ReviewStatus_new" RENAME TO "ReviewStatus";
