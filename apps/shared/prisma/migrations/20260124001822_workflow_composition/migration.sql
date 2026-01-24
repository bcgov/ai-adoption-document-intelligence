/*
  Warnings:

  - A unique constraint covering the columns `[workflow_execution_id]` on the table `documents` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "documents_workflow_id_key";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "workflow_config_id" TEXT,
ADD COLUMN     "workflow_execution_id" TEXT;

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_workflow_execution_id_key" ON "documents"("workflow_execution_id");
