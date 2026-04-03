-- CreateTable
CREATE TABLE "document_locks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_locks_document_id_key" ON "document_locks"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_locks_session_id_key" ON "document_locks"("session_id");

-- CreateIndex
CREATE INDEX "document_locks_expires_at_idx" ON "document_locks"("expires_at");

-- AddForeignKey
ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
