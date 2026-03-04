-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "document_id" TEXT,
    "workflow_execution_id" TEXT,
    "group_id" TEXT,
    "request_id" TEXT,
    "payload" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_event_type_idx" ON "audit_events"("event_type");

-- CreateIndex
CREATE INDEX "audit_events_resource_type_idx" ON "audit_events"("resource_type");

-- CreateIndex
CREATE INDEX "audit_events_document_id_idx" ON "audit_events"("document_id");

-- CreateIndex
CREATE INDEX "audit_events_workflow_execution_id_idx" ON "audit_events"("workflow_execution_id");

-- CreateIndex
CREATE INDEX "audit_events_group_id_idx" ON "audit_events"("group_id");
