/*
  Warnings:

  - The values [pending,processed] on the enum `DocumentStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `status` on the `ocr_results` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[document_id]` on the table `ocr_results` will be added. If there are existing duplicate values, this will fail.
  - Made the column `extracted_text` on table `ocr_results` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DocumentStatus_new" AS ENUM ('pre_ocr', 'ongoing_ocr', 'completed_ocr', 'failed');
ALTER TABLE "public"."documents" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "documents" ALTER COLUMN "status" TYPE "DocumentStatus_new" USING ("status"::text::"DocumentStatus_new");
ALTER TYPE "DocumentStatus" RENAME TO "DocumentStatus_old";
ALTER TYPE "DocumentStatus_new" RENAME TO "DocumentStatus";
DROP TYPE "public"."DocumentStatus_old";
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'pre_ocr';
COMMIT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "apim_request_id" TEXT,
ALTER COLUMN "status" SET DEFAULT 'pre_ocr';

-- AlterTable
ALTER TABLE "ocr_results" DROP COLUMN "status",
ALTER COLUMN "extracted_text" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ocr_results_document_id_key" ON "ocr_results"("document_id");
