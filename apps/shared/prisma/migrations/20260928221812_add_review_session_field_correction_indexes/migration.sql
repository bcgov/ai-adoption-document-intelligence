-- CreateIndex
CREATE INDEX "field_corrections_session_id_idx" ON "field_corrections"("session_id");

-- CreateIndex
CREATE INDEX "review_sessions_document_id_idx" ON "review_sessions"("document_id");

-- CreateIndex
CREATE INDEX "review_sessions_status_completed_at_idx" ON "review_sessions"("status", "completed_at");
