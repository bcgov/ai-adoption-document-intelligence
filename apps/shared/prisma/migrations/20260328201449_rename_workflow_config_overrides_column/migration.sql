/*
  Warnings:

  - You are about to drop the column `workflowConfigOverrides` on the `benchmark_definitions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "benchmark_definitions" DROP COLUMN "workflowConfigOverrides",
ADD COLUMN     "workflow_config_overrides" JSONB DEFAULT '{}';
