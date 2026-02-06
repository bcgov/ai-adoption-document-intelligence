/*
  Warnings:

  - The values [table] on the enum `FieldType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "FieldType_new" AS ENUM ('string', 'number', 'date', 'selectionMark', 'signature');
ALTER TABLE "public"."field_definitions" ALTER COLUMN "field_type" DROP DEFAULT;
ALTER TABLE "field_definitions" ALTER COLUMN "field_type" TYPE "FieldType_new" USING ("field_type"::text::"FieldType_new");
ALTER TYPE "FieldType" RENAME TO "FieldType_old";
ALTER TYPE "FieldType_new" RENAME TO "FieldType";
DROP TYPE "public"."FieldType_old";
ALTER TABLE "field_definitions" ALTER COLUMN "field_type" SET DEFAULT 'string';
COMMIT;

-- DropEnum
DROP TYPE "TableType";
