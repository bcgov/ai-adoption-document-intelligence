-- CreateEnum
CREATE TYPE "TemplateModelStatus" AS ENUM ('draft', 'training', 'trained', 'failed');

-- Dev mode: clear existing data from dependent tables before restructuring
DELETE FROM "document_labels";
DELETE FROM "trained_models";
DELETE FROM "training_jobs";
DELETE FROM "labeled_documents";
DELETE FROM "field_definitions";

-- DropForeignKey
ALTER TABLE "field_definitions" DROP CONSTRAINT "field_definitions_project_id_fkey";
ALTER TABLE "labeled_documents" DROP CONSTRAINT "labeled_documents_project_id_fkey";
ALTER TABLE "training_jobs" DROP CONSTRAINT "training_jobs_project_id_fkey";
ALTER TABLE "trained_models" DROP CONSTRAINT "trained_models_project_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "field_definitions_project_id_field_key_key";
DROP INDEX IF EXISTS "labeled_documents_project_id_labeling_document_id_key";
DROP INDEX IF EXISTS "training_jobs_project_id_idx";
DROP INDEX IF EXISTS "trained_models_project_id_idx";

-- CreateTable: template_models (replaces labeling_projects)
CREATE TABLE "template_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "TemplateModelStatus" NOT NULL DEFAULT 'draft',
    "group_id" TEXT NOT NULL,

    CONSTRAINT "template_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "template_models_model_id_key" ON "template_models"("model_id");
CREATE INDEX "template_models_group_id_idx" ON "template_models"("group_id");

ALTER TABLE "template_models" ADD CONSTRAINT "template_models_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "template_models" ADD CONSTRAINT "template_models_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rename FK columns in field_definitions
ALTER TABLE "field_definitions" RENAME COLUMN "project_id" TO "template_model_id";
CREATE UNIQUE INDEX "field_definitions_template_model_id_field_key_key" ON "field_definitions"("template_model_id", "field_key");
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_template_model_id_fkey" FOREIGN KEY ("template_model_id") REFERENCES "template_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rename FK columns in labeled_documents
ALTER TABLE "labeled_documents" RENAME COLUMN "project_id" TO "template_model_id";
CREATE UNIQUE INDEX "labeled_documents_template_model_id_labeling_document_id_key" ON "labeled_documents"("template_model_id", "labeling_document_id");
ALTER TABLE "labeled_documents" ADD CONSTRAINT "labeled_documents_template_model_id_fkey" FOREIGN KEY ("template_model_id") REFERENCES "template_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rename FK columns in training_jobs, remove model_id column
ALTER TABLE "training_jobs" RENAME COLUMN "project_id" TO "template_model_id";
ALTER TABLE "training_jobs" DROP COLUMN "model_id";
CREATE INDEX "training_jobs_template_model_id_idx" ON "training_jobs"("template_model_id");
ALTER TABLE "training_jobs" ADD CONSTRAINT "training_jobs_template_model_id_fkey" FOREIGN KEY ("template_model_id") REFERENCES "template_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rename FK columns in trained_models, add unique constraints for one-to-one
ALTER TABLE "trained_models" RENAME COLUMN "project_id" TO "template_model_id";
CREATE UNIQUE INDEX "trained_models_template_model_id_key" ON "trained_models"("template_model_id");
CREATE UNIQUE INDEX "trained_models_training_job_id_key" ON "trained_models"("training_job_id");
ALTER TABLE "trained_models" ADD CONSTRAINT "trained_models_template_model_id_fkey" FOREIGN KEY ("template_model_id") REFERENCES "template_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old table and enum
DROP TABLE "labeling_projects";
DROP TYPE "ProjectStatus";
