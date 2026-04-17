/*
  Migrate from single workflows table to workflow_lineages + workflow_versions.

  Changes:
  - Create WorkflowKind enum
  - Create workflow_lineages table (replaces workflows)
  - Create workflow_versions table (stores versioned configs)
  - Create benchmark_ocr_cache table
  - Migrate benchmark_definitions.workflowId -> workflowVersionId
  - Migrate dataset_ground_truth_jobs.workflowConfigId -> workflowVersionId
  - Add documents.workflow_config_id FK to workflow_versions
  - Add unique constraint on group_membership_request

  Data migration: Each existing workflow becomes a lineage with one version.
*/

-- CreateEnum
CREATE TYPE "WorkflowKind" AS ENUM ('primary', 'benchmark_candidate');

-- CreateTable
CREATE TABLE "workflow_lineages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "actor_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "workflow_kind" "WorkflowKind" NOT NULL DEFAULT 'primary',
    "source_workflow_id" TEXT,
    "head_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_lineages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "lineage_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_ocr_cache" (
    "id" TEXT NOT NULL,
    "sourceRunId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "ocrResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_ocr_cache_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Data migration: convert each workflow into a lineage + version
-- ============================================================

-- 1. Create a lineage for each existing workflow
INSERT INTO "workflow_lineages" ("id", "name", "description", "actor_id", "group_id", "workflow_kind", "created_at", "updated_at")
SELECT "id", "name", "description", "actor_id", "group_id", 'primary'::"WorkflowKind", "created_at", "updated_at"
FROM "workflows";

-- 2. Create a version (v1) for each workflow, using a generated UUID
INSERT INTO "workflow_versions" ("id", "lineage_id", "version_number", "config", "created_at")
SELECT gen_random_uuid()::text, "id", 1, "config", "created_at"
FROM "workflows";

-- 3. Set head_version_id on each lineage
UPDATE "workflow_lineages" wl
SET "head_version_id" = wv."id"
FROM "workflow_versions" wv
WHERE wv."lineage_id" = wl."id" AND wv."version_number" = 1;

-- ============================================================
-- Alter benchmark_definitions: workflowId -> workflowVersionId
-- ============================================================

-- Add the new column (nullable first for data migration)
ALTER TABLE "benchmark_definitions" ADD COLUMN "workflowVersionId" TEXT;

-- Populate from existing workflowId -> the v1 version
UPDATE "benchmark_definitions" bd
SET "workflowVersionId" = wv."id"
FROM "workflow_versions" wv
WHERE wv."lineage_id" = bd."workflowId" AND wv."version_number" = 1;

-- Make it NOT NULL now that data is migrated
ALTER TABLE "benchmark_definitions" ALTER COLUMN "workflowVersionId" SET NOT NULL;

-- Drop old FK and column
ALTER TABLE "benchmark_definitions" DROP CONSTRAINT IF EXISTS "benchmark_definitions_workflowId_fkey";
DROP INDEX IF EXISTS "benchmark_definitions_workflowId_idx";
ALTER TABLE "benchmark_definitions" DROP COLUMN "workflowId";

-- ============================================================
-- Alter dataset_ground_truth_jobs: workflowConfigId -> workflowVersionId
-- ============================================================

ALTER TABLE "dataset_ground_truth_jobs" ADD COLUMN "workflowVersionId" TEXT;

UPDATE "dataset_ground_truth_jobs" dg
SET "workflowVersionId" = wv."id"
FROM "workflow_versions" wv
WHERE wv."lineage_id" = dg."workflowConfigId" AND wv."version_number" = 1;

-- If no matching workflow, use a fallback (set to first available version)
UPDATE "dataset_ground_truth_jobs"
SET "workflowVersionId" = (SELECT "id" FROM "workflow_versions" LIMIT 1)
WHERE "workflowVersionId" IS NULL AND EXISTS (SELECT 1 FROM "workflow_versions");

ALTER TABLE "dataset_ground_truth_jobs" ALTER COLUMN "workflowVersionId" SET NOT NULL;

ALTER TABLE "dataset_ground_truth_jobs" DROP COLUMN "workflowConfigId";

-- ============================================================
-- Drop old workflows table
-- ============================================================

-- Drop FKs referencing workflows
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_group_id_fkey";
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_actor_id_fkey";

-- Drop the table
DROP TABLE "workflows";

-- ============================================================
-- Create indexes
-- ============================================================

CREATE UNIQUE INDEX "workflow_lineages_head_version_id_key" ON "workflow_lineages"("head_version_id");
CREATE INDEX "workflow_lineages_group_id_idx" ON "workflow_lineages"("group_id");
CREATE INDEX "workflow_versions_lineage_id_idx" ON "workflow_versions"("lineage_id");
CREATE UNIQUE INDEX "workflow_versions_lineage_id_version_number_key" ON "workflow_versions"("lineage_id", "version_number");
CREATE INDEX "benchmark_ocr_cache_sourceRunId_idx" ON "benchmark_ocr_cache"("sourceRunId");
CREATE UNIQUE INDEX "benchmark_ocr_cache_sourceRunId_sampleId_key" ON "benchmark_ocr_cache"("sourceRunId", "sampleId");
CREATE INDEX "benchmark_definitions_workflowVersionId_idx" ON "benchmark_definitions"("workflowVersionId");
CREATE INDEX "dataset_ground_truth_jobs_workflowVersionId_idx" ON "dataset_ground_truth_jobs"("workflowVersionId");
CREATE INDEX IF NOT EXISTS "documents_workflow_config_id_idx" ON "documents"("workflow_config_id");
CREATE UNIQUE INDEX IF NOT EXISTS "group_membership_request_group_id_user_id_status_key" ON "group_membership_request"("group_id", "user_id", "status");

-- ============================================================
-- Add foreign keys
-- ============================================================

-- workflow_lineages FKs
ALTER TABLE "workflow_lineages" ADD CONSTRAINT "workflow_lineages_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_lineages" ADD CONSTRAINT "workflow_lineages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_lineages" ADD CONSTRAINT "workflow_lineages_source_workflow_id_fkey" FOREIGN KEY ("source_workflow_id") REFERENCES "workflow_lineages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_lineages" ADD CONSTRAINT "workflow_lineages_head_version_id_fkey" FOREIGN KEY ("head_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- workflow_versions FKs
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_lineage_id_fkey" FOREIGN KEY ("lineage_id") REFERENCES "workflow_lineages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-add datasets/benchmark_projects FKs that were dropped by AI-1053 migration (they need re-adding after table changes)
-- These may already exist from init - use IF NOT EXISTS pattern via DO block
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'datasets_group_id_fkey') THEN
    ALTER TABLE "datasets" ADD CONSTRAINT "datasets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'benchmark_projects_group_id_fkey') THEN
    ALTER TABLE "benchmark_projects" ADD CONSTRAINT "benchmark_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- benchmark_definitions FK
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remap documents.workflow_config_id from lineage IDs to version IDs
UPDATE "documents" d
SET "workflow_config_id" = wv."id"
FROM "workflow_versions" wv
WHERE wv."lineage_id" = d."workflow_config_id" AND wv."version_number" = 1;

-- Null out any remaining references that don't match a version (orphaned)
UPDATE "documents"
SET "workflow_config_id" = NULL
WHERE "workflow_config_id" IS NOT NULL
  AND "workflow_config_id" NOT IN (SELECT "id" FROM "workflow_versions");

-- documents FK (workflow_config_id now points to workflow_versions)
ALTER TABLE "documents" ADD CONSTRAINT "documents_workflow_config_id_fkey" FOREIGN KEY ("workflow_config_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- benchmark_ocr_cache FK
ALTER TABLE "benchmark_ocr_cache" ADD CONSTRAINT "benchmark_ocr_cache_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "benchmark_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- dataset_ground_truth_jobs FK
ALTER TABLE "dataset_ground_truth_jobs" ADD CONSTRAINT "dataset_ground_truth_jobs_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
