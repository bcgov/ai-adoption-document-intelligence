-- Delete rows with null group_id before applying NOT NULL constraints
DELETE FROM "datasets" WHERE "group_id" IS NULL;
DELETE FROM "benchmark_projects" WHERE "group_id" IS NULL;

-- Make group_id NOT NULL on both tables
ALTER TABLE "datasets" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "benchmark_projects" ALTER COLUMN "group_id" SET NOT NULL;

-- Change unique constraints from global name to (name, group_id)
DROP INDEX "datasets_name_key";
CREATE UNIQUE INDEX "datasets_name_group_id_key" ON "datasets"("name", "group_id");

DROP INDEX "benchmark_projects_name_key";
CREATE UNIQUE INDEX "benchmark_projects_name_group_id_key" ON "benchmark_projects"("name", "group_id");
