-- AlterTable
ALTER TABLE "documents" ADD COLUMN "content_hash" TEXT;

-- AlterTable
ALTER TABLE "labeling_documents" ADD COLUMN "content_hash" TEXT;

-- CreateIndex
CREATE INDEX "documents_group_id_content_hash_idx" ON "documents"("group_id", "content_hash");

-- CreateIndex
CREATE INDEX "labeling_documents_group_id_content_hash_idx" ON "labeling_documents"("group_id", "content_hash");
