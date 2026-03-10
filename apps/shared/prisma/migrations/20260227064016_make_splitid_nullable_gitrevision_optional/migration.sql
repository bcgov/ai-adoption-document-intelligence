-- DropForeignKey
ALTER TABLE "benchmark_definitions" DROP CONSTRAINT "benchmark_definitions_splitId_fkey";

-- AlterTable
ALTER TABLE "benchmark_definitions" ALTER COLUMN "splitId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "dataset_versions" ALTER COLUMN "gitRevision" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "splits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
