-- CreateTable
CREATE TABLE "activity_output_cache" (
    "id" TEXT NOT NULL,
    "workflow_lineage_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "config_hash" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "output_ctx" JSONB NOT NULL,
    "output_kind" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_output_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_output_cache_workflow_lineage_id_node_id_idx" ON "activity_output_cache"("workflow_lineage_id", "node_id");

-- CreateIndex
CREATE INDEX "activity_output_cache_expires_at_idx" ON "activity_output_cache"("expires_at");

-- CreateIndex
CREATE INDEX "activity_output_cache_workflow_lineage_id_created_at_idx" ON "activity_output_cache"("workflow_lineage_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "activity_output_cache_workflow_lineage_id_node_id_config_ha_key" ON "activity_output_cache"("workflow_lineage_id", "node_id", "config_hash", "input_hash");
