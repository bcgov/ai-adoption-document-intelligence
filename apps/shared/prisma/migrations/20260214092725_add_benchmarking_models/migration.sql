-- CreateEnum
CREATE TYPE "DatasetVersionStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('train', 'val', 'test', 'golden');

-- CreateEnum
CREATE TYPE "BenchmarkRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "BenchmarkArtifactType" AS ENUM ('per_doc_output', 'intermediate_node_output', 'diff_report', 'evaluation_report', 'error_log');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('dataset_created', 'version_published', 'run_started', 'run_completed', 'baseline_promoted', 'artifact_deleted');

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "repositoryUrl" TEXT NOT NULL,
    "dvcRemote" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_versions" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "gitRevision" TEXT NOT NULL,
    "manifestPath" TEXT NOT NULL,
    "documentCount" INTEGER NOT NULL,
    "groundTruthSchema" JSONB,
    "status" "DatasetVersionStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "splits" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SplitType" NOT NULL,
    "sampleIds" JSONB NOT NULL,
    "stratificationRules" JSONB,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mlflowExperimentId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_definitions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "splitId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowConfigHash" TEXT NOT NULL,
    "evaluatorType" TEXT NOT NULL,
    "evaluatorConfig" JSONB NOT NULL,
    "runtimeSettings" JSONB NOT NULL,
    "artifactPolicy" JSONB NOT NULL,
    "immutable" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_runs" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "BenchmarkRunStatus" NOT NULL DEFAULT 'pending',
    "mlflowRunId" TEXT NOT NULL,
    "temporalWorkflowId" TEXT NOT NULL,
    "workerImageDigest" TEXT,
    "workerGitSha" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "params" JSONB NOT NULL DEFAULT '{}',
    "tags" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_artifacts" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "BenchmarkArtifactType" NOT NULL,
    "path" TEXT NOT NULL,
    "sampleId" TEXT,
    "nodeId" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_audit_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "benchmark_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dataset_versions_datasetId_idx" ON "dataset_versions"("datasetId");

-- CreateIndex
CREATE INDEX "splits_datasetVersionId_idx" ON "splits"("datasetVersionId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_projectId_idx" ON "benchmark_definitions"("projectId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_datasetVersionId_idx" ON "benchmark_definitions"("datasetVersionId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_splitId_idx" ON "benchmark_definitions"("splitId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_workflowId_idx" ON "benchmark_definitions"("workflowId");

-- CreateIndex
CREATE INDEX "benchmark_runs_definitionId_idx" ON "benchmark_runs"("definitionId");

-- CreateIndex
CREATE INDEX "benchmark_runs_projectId_idx" ON "benchmark_runs"("projectId");

-- CreateIndex
CREATE INDEX "benchmark_artifacts_runId_idx" ON "benchmark_artifacts"("runId");

-- CreateIndex
CREATE INDEX "benchmark_audit_logs_timestamp_idx" ON "benchmark_audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "benchmark_audit_logs_userId_idx" ON "benchmark_audit_logs"("userId");

-- CreateIndex
CREATE INDEX "benchmark_audit_logs_entityType_entityId_idx" ON "benchmark_audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "splits" ADD CONSTRAINT "splits_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "dataset_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "benchmark_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "dataset_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "splits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "benchmark_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "benchmark_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_artifacts" ADD CONSTRAINT "benchmark_artifacts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "benchmark_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
