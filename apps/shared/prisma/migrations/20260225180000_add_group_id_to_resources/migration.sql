-- AlterTable: Add nullable group_id to documents
ALTER TABLE "documents" ADD COLUMN "group_id" TEXT;

-- CreateIndex: documents_group_id
CREATE INDEX "documents_group_id_idx" ON "documents"("group_id");

-- AddForeignKey: documents.group_id -> group.id
ALTER TABLE "documents" ADD CONSTRAINT "documents_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add nullable group_id to workflows
ALTER TABLE "workflows" ADD COLUMN "group_id" TEXT;

-- CreateIndex: workflows_group_id
CREATE INDEX "workflows_group_id_idx" ON "workflows"("group_id");

-- AddForeignKey: workflows.group_id -> group.id
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add nullable group_id to labeling_projects
ALTER TABLE "labeling_projects" ADD COLUMN "group_id" TEXT;

-- CreateIndex: labeling_projects_group_id
CREATE INDEX "labeling_projects_group_id_idx" ON "labeling_projects"("group_id");

-- AddForeignKey: labeling_projects.group_id -> group.id
ALTER TABLE "labeling_projects" ADD CONSTRAINT "labeling_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add nullable group_id to labeling_documents
ALTER TABLE "labeling_documents" ADD COLUMN "group_id" TEXT;

-- CreateIndex: labeling_documents_group_id
CREATE INDEX "labeling_documents_group_id_idx" ON "labeling_documents"("group_id");

-- AddForeignKey: labeling_documents.group_id -> group.id
ALTER TABLE "labeling_documents" ADD CONSTRAINT "labeling_documents_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Handle ApiKey: delete existing rows that have no group association before adding the non-nullable constraint
DELETE FROM "api_keys";

-- AlterTable: Add non-nullable group_id to api_keys
ALTER TABLE "api_keys" ADD COLUMN "group_id" TEXT NOT NULL;

-- CreateIndex: api_keys_group_id
CREATE INDEX "api_keys_group_id_idx" ON "api_keys"("group_id");

-- AddForeignKey: api_keys.group_id -> group.id
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
