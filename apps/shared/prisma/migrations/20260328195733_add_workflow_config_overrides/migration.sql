-- AlterTable
ALTER TABLE "benchmark_definitions" ADD COLUMN     "workflowConfigOverrides" JSONB DEFAULT '{}';
