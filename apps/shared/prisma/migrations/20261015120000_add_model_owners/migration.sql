-- CreateTable
CREATE TABLE "model_owners" (
    "model_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_owners_pkey" PRIMARY KEY ("model_id")
);

-- CreateIndex
CREATE INDEX "model_owners_group_id_idx" ON "model_owners"("group_id");

-- Every model id a template has trained, or started training, belongs to the
-- template's group. A training job without a target model id predates model
-- versions, when every training built the template's own model id.
INSERT INTO "model_owners" ("model_id", "group_id")
SELECT lower(owned."model_id"), owned."group_id"
FROM (
    SELECT tm."model_id", t."group_id"
    FROM "trained_models" tm
    JOIN "template_models" t ON t."id" = tm."template_model_id"
    UNION
    SELECT COALESCE(tj."target_model_id", t."model_id"), t."group_id"
    FROM "training_jobs" tj
    JOIN "template_models" t ON t."id" = tj."template_model_id"
) owned
ON CONFLICT ("model_id") DO NOTHING;

-- A deleted template's rows are gone, but its models can remain in Azure, and
-- the audit log names their groups: a successful build records
-- trained_model_activated with the model id, and every training records
-- training_job_started with its target model id. Where events of more than
-- one group name an id, the latest successful build decides, then the latest
-- training started.
INSERT INTO "model_owners" ("model_id", "group_id")
SELECT DISTINCT ON (lower(ae."payload"->>'model_id'))
    lower(ae."payload"->>'model_id'), ae."group_id"
FROM "audit_events" ae
WHERE ae."event_type" = 'trained_model_activated'
  AND ae."group_id" IS NOT NULL
  AND ae."payload"->>'model_id' IS NOT NULL
ORDER BY lower(ae."payload"->>'model_id'), ae."occurred_at" DESC
ON CONFLICT ("model_id") DO NOTHING;

INSERT INTO "model_owners" ("model_id", "group_id")
SELECT DISTINCT ON (lower(ae."payload"->>'target_model_id'))
    lower(ae."payload"->>'target_model_id'), ae."group_id"
FROM "audit_events" ae
WHERE ae."event_type" = 'training_job_started'
  AND ae."group_id" IS NOT NULL
  AND ae."payload"->>'target_model_id' IS NOT NULL
ORDER BY lower(ae."payload"->>'target_model_id'), ae."occurred_at" DESC
ON CONFLICT ("model_id") DO NOTHING;
