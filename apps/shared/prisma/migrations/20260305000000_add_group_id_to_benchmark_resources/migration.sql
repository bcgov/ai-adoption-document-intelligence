-- AlterTable: Add nullable group_id to datasets
ALTER TABLE "datasets" ADD COLUMN "group_id" TEXT;

-- CreateIndex: datasets_group_id
CREATE INDEX "datasets_group_id_idx" ON "datasets"("group_id");

-- AddForeignKey: datasets.group_id -> group.id
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add nullable group_id to benchmark_projects
ALTER TABLE "benchmark_projects" ADD COLUMN "group_id" TEXT;

-- CreateIndex: benchmark_projects_group_id
CREATE INDEX "benchmark_projects_group_id_idx" ON "benchmark_projects"("group_id");

-- AddForeignKey: benchmark_projects.group_id -> group.id
ALTER TABLE "benchmark_projects" ADD CONSTRAINT "benchmark_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
