-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('workflow_started', 'activity_completed', 'workflow_completed', 'workflow_failed', 'workflow_cancelled', 'model_training_started', 'storage_daily_charge');

-- CreateEnum
CREATE TYPE "ActivityCostType" AS ENUM ('flat', 'per_page');

-- Restore trigram GIN indexes dropped by Prisma drift detection.
-- These are managed manually (Prisma cannot express GIN indexes).
-- See migration 20260626000000_add_documents_list_indexes.
CREATE INDEX IF NOT EXISTS "documents_title_trgm_idx"
  ON "documents" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "documents_original_filename_trgm_idx"
  ON "documents" USING GIN ("original_filename" gin_trgm_ops);

-- CreateTable
CREATE TABLE "rate_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "unit_cost_dollars" DECIMAL(18,8) NOT NULL,
    "cost_per_gb_units_per_month" DECIMAL(18,8) NOT NULL,
    "max_pages_assumption" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_costs" (
    "id" TEXT NOT NULL,
    "rate_version_id" TEXT NOT NULL,
    "activity_name" TEXT NOT NULL,
    "cost_type" "ActivityCostType" NOT NULL,
    "units" DECIMAL(18,8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "event_type" "UsageEventType" NOT NULL,
    "group_id" TEXT NOT NULL,
    "workflow_execution_id" TEXT,
    "activity_name" TEXT,
    "metered_quantity" INTEGER,
    "units_consumed" DECIMAL(18,8) NOT NULL,
    "estimated_units" DECIMAL(18,8),
    "storage_gb_hours" DECIMAL(18,8),
    "resource_id" TEXT,
    "resource_type" TEXT,
    "rate_version_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_period_summaries" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "total_units_consumed" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "total_dollars_spent" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_period_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_billing_configs" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "monthly_cap_dollars" DECIMAL(18,8),
    "cap_configured_by" TEXT,
    "cap_configured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_billing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_storage_ledger" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "blob_key" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "written_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_storage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_versions_version_key" ON "rate_versions"("version");

-- CreateIndex
CREATE INDEX "activity_costs_rate_version_id_idx" ON "activity_costs"("rate_version_id");

-- CreateIndex
CREATE INDEX "usage_events_group_id_created_at_idx" ON "usage_events"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_events_workflow_execution_id_idx" ON "usage_events"("workflow_execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_period_summaries_group_id_period_year_period_month_key" ON "usage_period_summaries"("group_id", "period_year", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "group_billing_configs_group_id_key" ON "group_billing_configs"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_storage_ledger_blob_key_key" ON "group_storage_ledger"("blob_key");

-- CreateIndex
CREATE INDEX "group_storage_ledger_group_id_idx" ON "group_storage_ledger"("group_id");

-- CreateIndex
CREATE INDEX "group_storage_ledger_group_id_written_at_deleted_at_idx" ON "group_storage_ledger"("group_id", "written_at", "deleted_at");

-- AddForeignKey
ALTER TABLE "activity_costs" ADD CONSTRAINT "activity_costs_rate_version_id_fkey" FOREIGN KEY ("rate_version_id") REFERENCES "rate_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_rate_version_id_fkey" FOREIGN KEY ("rate_version_id") REFERENCES "rate_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_billing_configs" ADD CONSTRAINT "group_billing_configs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
