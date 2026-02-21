-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];
