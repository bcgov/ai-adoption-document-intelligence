-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_group_id_fkey";

-- DropForeignKey
ALTER TABLE "labeling_documents" DROP CONSTRAINT "labeling_documents_group_id_fkey";

-- DropForeignKey
ALTER TABLE "labeling_projects" DROP CONSTRAINT "labeling_projects_group_id_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_group_id_fkey";

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labeling_documents" ADD CONSTRAINT "labeling_documents_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labeling_projects" ADD CONSTRAINT "labeling_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
