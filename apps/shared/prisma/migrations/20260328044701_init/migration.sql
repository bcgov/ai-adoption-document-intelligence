-- CreateEnum
CREATE TYPE "TemplateModelStatus" AS ENUM ('draft', 'training', 'trained', 'failed');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('string', 'number', 'date', 'selectionMark', 'signature');

-- CreateEnum
CREATE TYPE "LabelingStatus" AS ENUM ('unlabeled', 'in_progress', 'labeled');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('in_progress', 'approved', 'escalated', 'skipped');

-- CreateEnum
CREATE TYPE "CorrectionAction" AS ENUM ('confirmed', 'corrected', 'flagged', 'deleted');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'TRAINING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClassifierSource" AS ENUM ('AZURE');

-- CreateEnum
CREATE TYPE "ClassifierStatus" AS ENUM ('PRETRAINING', 'FAILED', 'TRAINING', 'READY');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pre_ocr', 'ongoing_ocr', 'completed_ocr', 'failed');

-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('train', 'val', 'test', 'golden');

-- CreateEnum
CREATE TYPE "BenchmarkRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('dataset_created', 'version_published', 'run_started', 'run_completed', 'baseline_promoted');

-- CreateEnum
CREATE TYPE "GroundTruthJobStatus" AS ENUM ('pending', 'processing', 'awaiting_review', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "GroupMembershipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "metadata" JSONB,
    "source" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pre_ocr',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "apim_request_id" TEXT,
    "workflow_id" TEXT,
    "workflow_config_id" TEXT,
    "workflow_execution_id" TEXT,
    "model_id" TEXT NOT NULL DEFAULT 'prebuilt-layout',
    "group_id" TEXT NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labeling_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "metadata" JSONB,
    "source" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pre_ocr',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "apim_request_id" TEXT,
    "model_id" TEXT NOT NULL DEFAULT 'prebuilt-layout',
    "ocr_result" JSONB,
    "group_id" TEXT NOT NULL,

    CONSTRAINT "labeling_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_results" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "keyValuePairs" JSONB,
    "enrichment_summary" JSONB,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "generating_user_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used" TIMESTAMP(3),
    "actor_id" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_system_admin" BOOLEAN NOT NULL DEFAULT false,
    "actor_id" TEXT NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actor" (
    "id" TEXT NOT NULL,

    CONSTRAINT "actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "actor_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "group_id" TEXT NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "TemplateModelStatus" NOT NULL DEFAULT 'draft',
    "group_id" TEXT NOT NULL,

    CONSTRAINT "template_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" TEXT NOT NULL,
    "template_model_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL DEFAULT 'string',
    "field_format" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labeled_documents" (
    "id" TEXT NOT NULL,
    "template_model_id" TEXT NOT NULL,
    "labeling_document_id" TEXT NOT NULL,
    "status" "LabelingStatus" NOT NULL DEFAULT 'unlabeled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labeled_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_labels" (
    "id" TEXT NOT NULL,
    "labeled_doc_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "label_name" TEXT NOT NULL,
    "value" TEXT,
    "page_number" INTEGER NOT NULL,
    "bounding_box" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_jobs" (
    "id" TEXT NOT NULL,
    "template_model_id" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'PENDING',
    "container_name" TEXT NOT NULL,
    "sas_url" TEXT,
    "blob_count" INTEGER NOT NULL DEFAULT 0,
    "operation_id" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "training_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trained_models" (
    "id" TEXT NOT NULL,
    "template_model_id" TEXT NOT NULL,
    "training_job_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "description" TEXT,
    "doc_types" JSONB,
    "field_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trained_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classifier_model" (
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" "ClassifierSource" NOT NULL,
    "status" "ClassifierStatus" NOT NULL DEFAULT 'PRETRAINING',
    "operation_location" TEXT,

    CONSTRAINT "classifier_model_pkey" PRIMARY KEY ("name","group_id")
);

-- CreateTable
CREATE TABLE "group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group" (
    "user_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_group_pkey" PRIMARY KEY ("user_id","group_id")
);

-- CreateTable
CREATE TABLE "group_membership_request" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "status" "GroupMembershipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "group_membership_request_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "review_sessions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "review_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_corrections" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "original_value" TEXT,
    "corrected_value" TEXT,
    "original_conf" DOUBLE PRECISION,
    "action" "CorrectionAction" NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "storagePath" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "group_id" TEXT NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_versions" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT,
    "storagePrefix" TEXT,
    "manifestPath" TEXT NOT NULL,
    "documentCount" INTEGER NOT NULL,
    "groundTruthSchema" JSONB,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "splits" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SplitType" NOT NULL,
    "sampleIds" JSONB NOT NULL,
    "stratificationRules" JSONB,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "group_id" TEXT NOT NULL,

    CONSTRAINT "benchmark_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_definitions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "splitId" TEXT,
    "workflowId" TEXT NOT NULL,
    "workflowConfigHash" TEXT NOT NULL,
    "evaluatorType" TEXT NOT NULL,
    "evaluatorConfig" JSONB NOT NULL,
    "runtimeSettings" JSONB NOT NULL,
    "immutable" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleCron" TEXT,
    "scheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_runs" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "BenchmarkRunStatus" NOT NULL DEFAULT 'pending',
    "temporalWorkflowId" TEXT NOT NULL,
    "workerImageDigest" TEXT,
    "workerGitSha" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "params" JSONB NOT NULL DEFAULT '{}',
    "tags" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "baselineThresholds" JSONB,
    "baselineComparison" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_audit_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "benchmark_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_ground_truth_jobs" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "documentId" TEXT,
    "workflowConfigId" TEXT NOT NULL,
    "temporalWorkflowId" TEXT,
    "status" "GroundTruthJobStatus" NOT NULL DEFAULT 'pending',
    "groundTruthPath" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dataset_ground_truth_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_workflow_execution_id_key" ON "documents"("workflow_execution_id");

-- CreateIndex
CREATE INDEX "documents_group_id_idx" ON "documents"("group_id");

-- CreateIndex
CREATE INDEX "labeling_documents_group_id_idx" ON "labeling_documents"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "ocr_results_document_id_key" ON "ocr_results"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_group_id_key" ON "api_keys"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_actor_id_key" ON "api_keys"("actor_id");

-- CreateIndex
CREATE INDEX "api_keys_group_id_idx" ON "api_keys"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_actor_id_key" ON "user"("actor_id");

-- CreateIndex
CREATE INDEX "workflows_group_id_idx" ON "workflows"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_models_model_id_key" ON "template_models"("model_id");

-- CreateIndex
CREATE INDEX "template_models_group_id_idx" ON "template_models"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_definitions_template_model_id_field_key_key" ON "field_definitions"("template_model_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "labeled_documents_template_model_id_labeling_document_id_key" ON "labeled_documents"("template_model_id", "labeling_document_id");

-- CreateIndex
CREATE INDEX "document_labels_labeled_doc_id_field_key_idx" ON "document_labels"("labeled_doc_id", "field_key");

-- CreateIndex
CREATE INDEX "training_jobs_template_model_id_idx" ON "training_jobs"("template_model_id");

-- CreateIndex
CREATE INDEX "training_jobs_status_idx" ON "training_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "trained_models_template_model_id_key" ON "trained_models"("template_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "trained_models_training_job_id_key" ON "trained_models"("training_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "trained_models_model_id_key" ON "trained_models"("model_id");

-- CreateIndex
CREATE INDEX "classifier_model_group_id_idx" ON "classifier_model"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_name_key" ON "group"("name");

-- CreateIndex
CREATE INDEX "user_group_group_id_idx" ON "user_group"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_membership_request_group_id_user_id_status_key" ON "group_membership_request"("group_id", "user_id", "status");

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

-- CreateIndex
CREATE INDEX "datasets_group_id_idx" ON "datasets"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_name_group_id_key" ON "datasets"("name", "group_id");

-- CreateIndex
CREATE INDEX "dataset_versions_datasetId_idx" ON "dataset_versions"("datasetId");

-- CreateIndex
CREATE INDEX "splits_datasetVersionId_idx" ON "splits"("datasetVersionId");

-- CreateIndex
CREATE INDEX "benchmark_projects_group_id_idx" ON "benchmark_projects"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_projects_name_group_id_key" ON "benchmark_projects"("name", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_definitions_scheduleId_key" ON "benchmark_definitions"("scheduleId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_projectId_idx" ON "benchmark_definitions"("projectId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_datasetVersionId_idx" ON "benchmark_definitions"("datasetVersionId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_splitId_idx" ON "benchmark_definitions"("splitId");

-- CreateIndex
CREATE INDEX "benchmark_definitions_workflowId_idx" ON "benchmark_definitions"("workflowId");

-- CreateIndex
CREATE INDEX "benchmark_runs_definitionId_idx" ON "benchmark_runs"("definitionId");

-- CreateIndex
CREATE INDEX "benchmark_runs_projectId_idx" ON "benchmark_runs"("projectId");

-- CreateIndex
CREATE INDEX "benchmark_audit_logs_timestamp_idx" ON "benchmark_audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "benchmark_audit_logs_actor_id_idx" ON "benchmark_audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "benchmark_audit_logs_entityType_entityId_idx" ON "benchmark_audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_ground_truth_jobs_documentId_key" ON "dataset_ground_truth_jobs"("documentId");

-- CreateIndex
CREATE INDEX "dataset_ground_truth_jobs_datasetVersionId_idx" ON "dataset_ground_truth_jobs"("datasetVersionId");

-- CreateIndex
CREATE INDEX "dataset_ground_truth_jobs_documentId_idx" ON "dataset_ground_truth_jobs"("documentId");

-- CreateIndex
CREATE INDEX "dataset_ground_truth_jobs_status_idx" ON "dataset_ground_truth_jobs"("status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labeling_documents" ADD CONSTRAINT "labeling_documents_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_results" ADD CONSTRAINT "ocr_results_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_generating_user_id_fkey" FOREIGN KEY ("generating_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_models" ADD CONSTRAINT "template_models_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_models" ADD CONSTRAINT "template_models_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_template_model_id_fkey" FOREIGN KEY ("template_model_id") REFERENCES "template_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labeled_documents" ADD CONSTRAINT "labeled_documents_template_model_id_fkey" FOREIGN KEY ("template_model_id") REFERENCES "template_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labeled_documents" ADD CONSTRAINT "labeled_documents_labeling_document_id_fkey" FOREIGN KEY ("labeling_document_id") REFERENCES "labeling_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_labels" ADD CONSTRAINT "document_labels_labeled_doc_id_fkey" FOREIGN KEY ("labeled_doc_id") REFERENCES "labeled_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_jobs" ADD CONSTRAINT "training_jobs_template_model_id_fkey" FOREIGN KEY ("template_model_id") REFERENCES "template_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trained_models" ADD CONSTRAINT "trained_models_template_model_id_fkey" FOREIGN KEY ("template_model_id") REFERENCES "template_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trained_models" ADD CONSTRAINT "trained_models_training_job_id_fkey" FOREIGN KEY ("training_job_id") REFERENCES "training_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classifier_model" ADD CONSTRAINT "classifier_model_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classifier_model" ADD CONSTRAINT "classifier_model_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classifier_model" ADD CONSTRAINT "classifier_model_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group" ADD CONSTRAINT "user_group_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group" ADD CONSTRAINT "user_group_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_membership_request" ADD CONSTRAINT "group_membership_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_membership_request" ADD CONSTRAINT "group_membership_request_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_membership_request" ADD CONSTRAINT "group_membership_request_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_membership_request" ADD CONSTRAINT "group_membership_request_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_corrections" ADD CONSTRAINT "field_corrections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "splits" ADD CONSTRAINT "splits_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "dataset_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_projects" ADD CONSTRAINT "benchmark_projects_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_projects" ADD CONSTRAINT "benchmark_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "benchmark_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "dataset_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "splits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_definitions" ADD CONSTRAINT "benchmark_definitions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "benchmark_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "benchmark_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_audit_logs" ADD CONSTRAINT "benchmark_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ground_truth_jobs" ADD CONSTRAINT "dataset_ground_truth_jobs_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "dataset_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ground_truth_jobs" ADD CONSTRAINT "dataset_ground_truth_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
