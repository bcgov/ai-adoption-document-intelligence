-- Add structured content blob to OCR results (replaces ad-hoc extracted_text/pages).
ALTER TABLE "ocr_results" ADD COLUMN "content" JSONB;

-- Add stable, human-friendly slug to workflow lineages, unique within a group.
ALTER TABLE "workflow_lineages" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "workflow_lineages" ALTER COLUMN "slug" DROP DEFAULT;
CREATE UNIQUE INDEX "workflow_lineages_group_id_slug_key" ON "workflow_lineages"("group_id", "slug");
