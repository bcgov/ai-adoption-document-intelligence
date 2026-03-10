-- AlterTable
ALTER TABLE "benchmark_definitions" ADD COLUMN     "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduleCron" TEXT,
ADD COLUMN     "scheduleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_definitions_scheduleId_key" ON "benchmark_definitions"("scheduleId");
