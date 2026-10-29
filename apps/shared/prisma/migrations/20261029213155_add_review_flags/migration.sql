/*
  Warnings:

  - You are about to drop the column `reopened_from_status` on the `review_sessions` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ReviewSessionEventType" ADD VALUE 'flag_addressed';

-- AlterTable
ALTER TABLE "review_session_events" ADD COLUMN     "review_flag_id" TEXT;

-- AlterTable
ALTER TABLE "review_sessions" DROP COLUMN "reopened_from_status";

-- CreateTable
CREATE TABLE "review_flags" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "raised_session_id" TEXT NOT NULL,
    "raised_by" TEXT NOT NULL,
    "note" TEXT,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_session_id" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "review_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_flags_document_id_resolved_at_idx" ON "review_flags"("document_id", "resolved_at");

-- CreateIndex
CREATE INDEX "review_flags_raised_session_id_idx" ON "review_flags"("raised_session_id");

-- CreateIndex
CREATE INDEX "review_session_events_review_flag_id_idx" ON "review_session_events"("review_flag_id");

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_raised_session_id_fkey" FOREIGN KEY ("raised_session_id") REFERENCES "review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_resolved_session_id_fkey" FOREIGN KEY ("resolved_session_id") REFERENCES "review_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session_events" ADD CONSTRAINT "review_session_events_review_flag_id_fkey" FOREIGN KEY ("review_flag_id") REFERENCES "review_flags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
