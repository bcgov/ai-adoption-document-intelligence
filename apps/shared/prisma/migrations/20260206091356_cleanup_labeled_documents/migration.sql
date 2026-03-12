-- AlterTable: Remove assigned_to and ocr_data columns from labeled_documents
ALTER TABLE "labeled_documents" DROP COLUMN "assigned_to";
ALTER TABLE "labeled_documents" DROP COLUMN "ocr_data";

-- AlterEnum: Remove 'reviewed' from LabelingStatus enum
-- Create new enum without 'reviewed'
CREATE TYPE "LabelingStatus_new" AS ENUM ('unlabeled', 'in_progress', 'labeled');

-- Drop the default constraint, update column to use new enum, then re-add default
ALTER TABLE "labeled_documents" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "labeled_documents" ALTER COLUMN "status" TYPE "LabelingStatus_new" USING ("status"::text::"LabelingStatus_new");
ALTER TABLE "labeled_documents" ALTER COLUMN "status" SET DEFAULT 'unlabeled'::"LabelingStatus_new";

-- Drop old enum and rename new one
DROP TYPE "LabelingStatus";
ALTER TYPE "LabelingStatus_new" RENAME TO "LabelingStatus";
