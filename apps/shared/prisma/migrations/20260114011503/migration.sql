/*
  Warnings:

  - A unique constraint covering the columns `[workflow_id]` on the table `documents` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "workflow_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "documents_workflow_id_key" ON "documents"("workflow_id");
