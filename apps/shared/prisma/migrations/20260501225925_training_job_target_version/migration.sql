-- AlterTable
ALTER TABLE "training_jobs"
  ADD COLUMN "target_model_id" TEXT,
  ADD COLUMN "target_version" INTEGER;
