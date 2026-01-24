-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'TRAINING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "training_jobs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'PENDING',
    "container_name" TEXT NOT NULL,
    "sas_url" TEXT,
    "blob_count" INTEGER NOT NULL DEFAULT 0,
    "model_id" TEXT,
    "operation_id" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "training_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trained_models" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "training_job_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "description" TEXT,
    "doc_types" JSONB,
    "field_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trained_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_jobs_project_id_idx" ON "training_jobs"("project_id");

-- CreateIndex
CREATE INDEX "training_jobs_status_idx" ON "training_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "trained_models_model_id_key" ON "trained_models"("model_id");

-- CreateIndex
CREATE INDEX "trained_models_project_id_idx" ON "trained_models"("project_id");

-- AddForeignKey
ALTER TABLE "training_jobs" ADD CONSTRAINT "training_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "labeling_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trained_models" ADD CONSTRAINT "trained_models_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "labeling_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trained_models" ADD CONSTRAINT "trained_models_training_job_id_fkey" FOREIGN KEY ("training_job_id") REFERENCES "training_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
