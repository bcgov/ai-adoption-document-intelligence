/*
  Warnings:

  - Added the required column `figures` to the `ocr_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paragraphs` to the `ocr_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sections` to the `ocr_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `styles` to the `ocr_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tables` to the `ocr_results` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ocr_results" ADD COLUMN     "figures" JSONB NOT NULL,
ADD COLUMN     "keyValuePairs" JSONB,
ADD COLUMN     "paragraphs" JSONB NOT NULL,
ADD COLUMN     "sections" JSONB NOT NULL,
ADD COLUMN     "styles" JSONB NOT NULL,
ADD COLUMN     "tables" JSONB NOT NULL;
