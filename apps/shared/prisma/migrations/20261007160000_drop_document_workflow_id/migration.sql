/*
  Warnings:

  - You are about to drop the column `workflow_id` on the `documents` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "documents" DROP COLUMN "workflow_id";
