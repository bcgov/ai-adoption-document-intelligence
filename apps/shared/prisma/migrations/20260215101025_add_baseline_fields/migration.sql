-- AlterTable
ALTER TABLE "benchmark_runs" ADD COLUMN     "baselineComparison" JSONB,
ADD COLUMN     "baselineThresholds" JSONB;
