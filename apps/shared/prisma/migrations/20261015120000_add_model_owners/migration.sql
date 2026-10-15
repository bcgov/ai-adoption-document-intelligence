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
-- template's group.
INSERT INTO "model_owners" ("model_id", "group_id")
SELECT lower(owned."model_id"), owned."group_id"
FROM (
    SELECT tm."model_id", t."group_id"
    FROM "trained_models" tm
    JOIN "template_models" t ON t."id" = tm."template_model_id"
    UNION
    SELECT tj."target_model_id", t."group_id"
    FROM "training_jobs" tj
    JOIN "template_models" t ON t."id" = tj."template_model_id"
    WHERE tj."target_model_id" IS NOT NULL
) owned
ON CONFLICT ("model_id") DO NOTHING;
