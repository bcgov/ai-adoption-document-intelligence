-- Create labeling_documents table
CREATE TABLE IF NOT EXISTS "labeling_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "metadata" JSONB,
    "source" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pre_ocr',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "apim_request_id" TEXT,
    "model_id" TEXT NOT NULL DEFAULT 'prebuilt-layout',
    "ocr_result" JSONB,
    CONSTRAINT "labeling_documents_pkey" PRIMARY KEY ("id")
);

-- Add labeling_document_id to labeled_documents
ALTER TABLE "labeled_documents" ADD COLUMN IF NOT EXISTS "labeling_document_id" TEXT;

-- Backfill labeling_documents from existing documents linked to labeled_documents
INSERT INTO "labeling_documents" (
    "id",
    "title",
    "original_filename",
    "file_path",
    "file_type",
    "file_size",
    "metadata",
    "source",
    "status",
    "created_at",
    "updated_at",
    "apim_request_id",
    "model_id",
    "ocr_result"
)
SELECT
    d."id",
    d."title",
    d."original_filename",
    d."file_path",
    d."file_type",
    d."file_size",
    d."metadata",
    d."source",
    d."status",
    d."created_at",
    d."updated_at",
    d."apim_request_id",
    d."model_id",
    NULL
FROM "documents" d
INNER JOIN "labeled_documents" ld ON ld."document_id" = d."id"
ON CONFLICT ("id") DO NOTHING;

UPDATE "labeled_documents"
SET "labeling_document_id" = "document_id"
WHERE "labeling_document_id" IS NULL;

-- Drop old constraints and column
ALTER TABLE "labeled_documents" DROP CONSTRAINT IF EXISTS "labeled_documents_project_id_document_id_key";
ALTER TABLE "labeled_documents" DROP CONSTRAINT IF EXISTS "labeled_documents_document_id_fkey";
ALTER TABLE "labeled_documents" DROP COLUMN IF EXISTS "document_id";

-- Enforce new relation
ALTER TABLE "labeled_documents" ALTER COLUMN "labeling_document_id" SET NOT NULL;
ALTER TABLE "labeled_documents"
ADD CONSTRAINT "labeled_documents_labeling_document_id_fkey"
FOREIGN KEY ("labeling_document_id") REFERENCES "labeling_documents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "labeled_documents_project_id_labeling_document_id_key"
ON "labeled_documents"("project_id", "labeling_document_id");
