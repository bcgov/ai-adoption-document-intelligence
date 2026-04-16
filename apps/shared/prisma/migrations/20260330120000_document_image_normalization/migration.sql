-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'conversion_failed';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "normalized_file_path" TEXT;

-- AlterTable
ALTER TABLE "labeling_documents" ADD COLUMN "normalized_file_path" TEXT;
