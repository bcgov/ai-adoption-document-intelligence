-- CreateEnum
CREATE TYPE "BuildMode" AS ENUM ('template', 'neural');

-- AlterTable
ALTER TABLE "trained_models" ADD COLUMN     "actual_training_hours" DOUBLE PRECISION,
ADD COLUMN     "build_mode" "BuildMode" NOT NULL DEFAULT 'template',
ADD COLUMN     "max_training_hours" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "training_jobs" ADD COLUMN     "build_mode" "BuildMode" NOT NULL DEFAULT 'template',
ADD COLUMN     "max_training_hours" DOUBLE PRECISION;
