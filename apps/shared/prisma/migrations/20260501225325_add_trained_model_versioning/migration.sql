-- DropIndex
DROP INDEX "trained_models_template_model_id_key";

-- AlterTable
ALTER TABLE "trained_models"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "dataset_snapshot" JSONB;

-- Mark existing rows as the active version for their template (1:1 history).
UPDATE "trained_models" SET "is_active" = true;

-- CreateIndex
CREATE UNIQUE INDEX "trained_models_template_model_id_version_key" ON "trained_models"("template_model_id", "version");

-- CreateIndex
CREATE INDEX "trained_models_template_model_id_is_active_idx" ON "trained_models"("template_model_id", "is_active");
