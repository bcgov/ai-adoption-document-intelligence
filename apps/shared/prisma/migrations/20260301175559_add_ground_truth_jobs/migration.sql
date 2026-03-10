-- CreateEnum
CREATE TYPE "GroundTruthJobStatus" AS ENUM ('pending', 'processing', 'awaiting_review', 'completed', 'failed');

-- CreateTable
CREATE TABLE "dataset_ground_truth_jobs" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "documentId" TEXT,
    "workflowConfigId" TEXT NOT NULL,
    "temporalWorkflowId" TEXT,
    "status" "GroundTruthJobStatus" NOT NULL DEFAULT 'pending',
    "groundTruthPath" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dataset_ground_truth_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_ground_truth_jobs_documentId_key" ON "dataset_ground_truth_jobs"("documentId");

-- CreateIndex
CREATE INDEX "dataset_ground_truth_jobs_datasetVersionId_idx" ON "dataset_ground_truth_jobs"("datasetVersionId");

-- CreateIndex
CREATE INDEX "dataset_ground_truth_jobs_documentId_idx" ON "dataset_ground_truth_jobs"("documentId");

-- CreateIndex
CREATE INDEX "dataset_ground_truth_jobs_status_idx" ON "dataset_ground_truth_jobs"("status");

-- AddForeignKey
ALTER TABLE "dataset_ground_truth_jobs" ADD CONSTRAINT "dataset_ground_truth_jobs_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "dataset_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ground_truth_jobs" ADD CONSTRAINT "dataset_ground_truth_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
