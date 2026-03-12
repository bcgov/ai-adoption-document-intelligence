/*
  Warnings:

  - You are about to drop the column `extracted_text` on the `ocr_results` table. All the data in the column will be lost.
  - You are about to drop the column `figures` on the `ocr_results` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `ocr_results` table. All the data in the column will be lost.
  - You are about to drop the column `pages` on the `ocr_results` table. All the data in the column will be lost.
  - You are about to drop the column `paragraphs` on the `ocr_results` table. All the data in the column will be lost.
  - You are about to drop the column `sections` on the `ocr_results` table. All the data in the column will be lost.
  - You are about to drop the column `styles` on the `ocr_results` table. All the data in the column will be lost.
  - You are about to drop the column `tables` on the `ocr_results` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ocr_results" DROP COLUMN "extracted_text",
DROP COLUMN "figures",
DROP COLUMN "metadata",
DROP COLUMN "pages",
DROP COLUMN "paragraphs",
DROP COLUMN "sections",
DROP COLUMN "styles",
DROP COLUMN "tables";
