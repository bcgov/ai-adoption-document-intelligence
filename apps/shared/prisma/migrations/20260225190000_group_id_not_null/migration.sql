-- Delete rows with null group_id before applying NOT NULL constraints
DELETE FROM "documents" WHERE "group_id" IS NULL;
DELETE FROM "workflows" WHERE "group_id" IS NULL;
DELETE FROM "labeling_projects" WHERE "group_id" IS NULL;
DELETE FROM "labeling_documents" WHERE "group_id" IS NULL;

-- Make group_id NOT NULL on all four resource tables
ALTER TABLE "documents" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "workflows" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "labeling_projects" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "labeling_documents" ALTER COLUMN "group_id" SET NOT NULL;
