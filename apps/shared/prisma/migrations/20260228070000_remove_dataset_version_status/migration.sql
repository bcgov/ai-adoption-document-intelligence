-- AlterTable
ALTER TABLE "dataset_versions" DROP COLUMN "publishedAt",
DROP COLUMN "status";

-- DropEnum
DROP TYPE "DatasetVersionStatus";
