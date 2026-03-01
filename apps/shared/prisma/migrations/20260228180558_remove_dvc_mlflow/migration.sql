-- DropIndex
DROP INDEX "datasets_repositoryUrl_key";

-- AlterTable
ALTER TABLE "benchmark_projects" DROP COLUMN "mlflowExperimentId";

-- AlterTable
ALTER TABLE "benchmark_runs" DROP COLUMN "mlflowRunId";

-- AlterTable
ALTER TABLE "dataset_versions" DROP COLUMN "gitRevision",
ADD COLUMN     "storagePrefix" TEXT;

-- AlterTable
ALTER TABLE "datasets" DROP COLUMN "dvcRemote",
DROP COLUMN "repositoryUrl",
ADD COLUMN     "storagePath" TEXT NOT NULL DEFAULT '';

-- Backfill storagePath for existing datasets
UPDATE "datasets" SET "storagePath" = 'datasets/' || "id" WHERE "storagePath" = '';

-- Deduplicate dataset names before adding unique constraint
UPDATE "datasets" d
SET "name" = d."name" || '-' || d."id"
WHERE EXISTS (
  SELECT 1 FROM "datasets" d2
  WHERE d2."name" = d."name" AND d2."id" < d."id"
);

-- Deduplicate project names before adding unique constraint
UPDATE "benchmark_projects" p
SET "name" = p."name" || '-' || p."id"
WHERE EXISTS (
  SELECT 1 FROM "benchmark_projects" p2
  WHERE p2."name" = p."name" AND p2."id" < p."id"
);

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_projects_name_key" ON "benchmark_projects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_name_key" ON "datasets"("name");
