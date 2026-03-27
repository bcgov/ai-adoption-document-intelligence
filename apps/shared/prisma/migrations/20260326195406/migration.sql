/*
  Warnings:

  - You are about to drop the column `workflowId` on the `benchmark_definitions` table. All the data in the column will be lost.
  - You are about to drop the column `workflowConfigId` on the `dataset_ground_truth_jobs` table. All the data in the column will be lost.
  - You are about to drop the `workflows` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[group_id,user_id,status]` on the table `group_membership_request` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `workflowVersionId` to the `benchmark_definitions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workflowVersionId` to the `dataset_ground_truth_jobs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WorkflowKind" AS ENUM ('primary', 'benchmark_candidate');

-- DropForeignKey
ALTER TABLE "benchmark_definitions" DROP CONSTRAINT "benchmark_definitions_workflowId_fkey";

-- DropForeignKey
ALTER TABLE "benchmark_projects" DROP CONSTRAINT "benchmark_projects_group_id_fkey";

-- DropForeignKey
ALTER TABLE "datasets" DROP CONSTRAINT "datasets_group_id_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_group_id_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_user_id_fkey";

-- DropIndex
DROP INDEX "benchmark_definitions_workflowId_idx";

-- AlterTable
ALTER TABLE "benchmark_definitions" DROP COLUMN "workflowId",
ADD COLUMN     "workflowVersionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "dataset_ground_truth_jobs" DROP COLUMN "workflowConfigId",
ADD COLUMN     "workflowVersionId" TEXT NOT NULL;

-- DropTable
DROP TABLE "workflows";

-- CreateTable
CREATE TABLE "workflow_lineages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "workflow_lineages_head_version_id_key" ON "workflow_lineages"("head_version_id");

-- CreateIndex
CREATE INDEX "workflow_lineages_group_id_idx" ON "workflow_lineages"("group_id");

-- CreateIndex
CREATE INDEX "workflow_versions_lineage_id_idx" ON "workflow_versions"("lineage_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_lineage_id_version_number_key" ON "workflow_versions"("lineage_id", "version_number");

-- CreateIndex
CREATE INDEX "benchmark_ocr_cache_sourceRunId_idx" ON "benchmark_ocr_cache"("sourceRunId");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_ocr_cache_sourceRunId_sampleId_key" ON "benchmark_ocr_cache"("sourceRunId", "sampleId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_workflowVersionId_idx" ON "benchmark_definitions"("workflowVersionId");

-- CreateIndex
CREATE INDEX "dataset_ground_truth_jobs_workflowVersionId_idx" ON "dataset_ground_truth_jobs"("workflowVersionId");

-- CreateIndex
CREATE INDEX "documents_workflow_config_id_idx" ON "documents"("workflow_config_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_membership_request_group_id_user_id_status_key" ON "group_membership_request"("group_id", "user_id", "status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workflow_config_id_fkey" FOREIGN KEY ("workflow_config_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_lineages" ADD CONSTRAINT "workflow_lineages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_lineages" ADD CONSTRAINT "workflow_lineages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_lineages" ADD CONSTRAINT "workflow_lineages_source_workflow_id_fkey" FOREIGN KEY ("source_workflow_id") REFERENCES "workflow_lineages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_lineages" ADD CONSTRAINT "workflow_lineages_head_version_id_fkey" FOREIGN KEY ("head_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_lineage_id_fkey" FOREIGN KEY ("lineage_id") REFERENCES "workflow_lineages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_projects" ADD CONSTRAINT "benchmark_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_ocr_cache" ADD CONSTRAINT "benchmark_ocr_cache_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "benchmark_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ground_truth_jobs" ADD CONSTRAINT "dataset_ground_truth_jobs_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
