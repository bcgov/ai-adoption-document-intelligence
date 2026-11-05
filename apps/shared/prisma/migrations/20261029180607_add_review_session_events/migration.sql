-- CreateEnum
CREATE TYPE "ReviewSessionEventType" AS ENUM ('flagged', 'rejected', 'skipped', 'approved', 'reopened');

-- AlterTable
ALTER TABLE "review_sessions" ADD COLUMN     "reopened_from_status" "ReviewStatus";

-- CreateTable
CREATE TABLE "review_session_events" (
    "id" TEXT NOT NULL,
    "review_session_id" TEXT NOT NULL,
    "event_type" "ReviewSessionEventType" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "comment" TEXT,
    "rejection_reason" "RejectionReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_session_events_review_session_id_idx" ON "review_session_events"("review_session_id");

-- CreateIndex
CREATE INDEX "review_session_events_created_at_idx" ON "review_session_events"("created_at");

-- AddForeignKey
ALTER TABLE "review_session_events" ADD CONSTRAINT "review_session_events_review_session_id_fkey" FOREIGN KEY ("review_session_id") REFERENCES "review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_session_events" ADD CONSTRAINT "review_session_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
