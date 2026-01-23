-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived', 'training');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('string', 'number', 'date', 'selectionMark', 'signature', 'table');

-- CreateEnum
CREATE TYPE "TableType" AS ENUM ('dynamic', 'fixed');

-- CreateEnum
CREATE TYPE "LabelingStatus" AS ENUM ('unlabeled', 'in_progress', 'labeled', 'reviewed');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('in_progress', 'approved', 'escalated', 'skipped');

-- CreateEnum
CREATE TYPE "CorrectionAction" AS ENUM ('confirmed', 'corrected', 'flagged', 'deleted');

-- CreateTable
CREATE TABLE "labeling_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "labeling_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL DEFAULT 'string',
    "field_format" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_table" BOOLEAN NOT NULL DEFAULT false,
    "table_type" "TableType",
    "column_headers" JSONB,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labeled_documents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "status" "LabelingStatus" NOT NULL DEFAULT 'unlabeled',
    "assigned_to" TEXT,
    "ocr_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labeled_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_labels" (
    "id" TEXT NOT NULL,
    "labeled_doc_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "label_name" TEXT NOT NULL,
    "value" TEXT,
    "page_number" INTEGER NOT NULL,
    "bounding_box" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "is_manual" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sessions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "review_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_corrections" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "original_value" TEXT,
    "corrected_value" TEXT,
    "original_conf" DOUBLE PRECISION,
    "action" "CorrectionAction" NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_definitions_project_id_field_key_key" ON "field_definitions"("project_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "labeled_documents_project_id_document_id_key" ON "labeled_documents"("project_id", "document_id");

-- CreateIndex
CREATE INDEX "document_labels_labeled_doc_id_field_key_idx" ON "document_labels"("labeled_doc_id", "field_key");

-- AddForeignKey
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "labeling_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labeled_documents" ADD CONSTRAINT "labeled_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "labeling_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labeled_documents" ADD CONSTRAINT "labeled_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_labels" ADD CONSTRAINT "document_labels_labeled_doc_id_fkey" FOREIGN KEY ("labeled_doc_id") REFERENCES "labeled_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_corrections" ADD CONSTRAINT "field_corrections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
