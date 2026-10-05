-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('INPUT_QUALITY', 'OCR_FAILURE', 'MODEL_MISMATCH', 'CONFIDENCE_TOO_LOW', 'SYSTEMIC_ERROR');

-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "review_sessions" ADD COLUMN     "rejection_comment" TEXT,
ADD COLUMN     "rejection_reason" "RejectionReason";
