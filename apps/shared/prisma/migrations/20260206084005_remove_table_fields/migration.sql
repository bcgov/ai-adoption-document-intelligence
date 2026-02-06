-- Remove unused table-related columns from field_definitions
ALTER TABLE "field_definitions" DROP COLUMN IF EXISTS "is_required";
ALTER TABLE "field_definitions" DROP COLUMN IF EXISTS "is_table";
ALTER TABLE "field_definitions" DROP COLUMN IF EXISTS "table_type";
ALTER TABLE "field_definitions" DROP COLUMN IF EXISTS "column_headers";
