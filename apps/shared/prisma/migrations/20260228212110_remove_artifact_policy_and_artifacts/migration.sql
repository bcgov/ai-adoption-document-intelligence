-- DropForeignKey
ALTER TABLE "benchmark_artifacts" DROP CONSTRAINT IF EXISTS "benchmark_artifacts_runId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "benchmark_artifacts_runId_idx";

-- AlterTable
ALTER TABLE "benchmark_definitions" DROP COLUMN IF EXISTS "artifactPolicy";

-- DropTable
DROP TABLE IF EXISTS "benchmark_artifacts";

-- AlterEnum: remove artifact_deleted from AuditAction
-- Create new enum without artifact_deleted, swap, and drop old
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
CREATE TYPE "AuditAction" AS ENUM ('dataset_created', 'version_published', 'run_started', 'run_completed', 'baseline_promoted');
ALTER TABLE "benchmark_audit_logs" ALTER COLUMN "action" TYPE "AuditAction" USING ("action"::text::"AuditAction");
DROP TYPE "AuditAction_old";

-- DropEnum
DROP TYPE IF EXISTS "BenchmarkArtifactType";
