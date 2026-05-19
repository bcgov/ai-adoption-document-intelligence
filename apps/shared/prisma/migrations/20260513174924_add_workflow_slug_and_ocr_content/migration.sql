-- Add structured content blob to OCR results (replaces ad-hoc extracted_text/pages).
ALTER TABLE "ocr_results" ADD COLUMN "content" JSONB;

-- Add stable, human-friendly slug to workflow lineages, unique within a group.
-- Created as nullable, backfilled from `name` (kebab-case, deduped within group),
-- then made NOT NULL and uniquely indexed.
ALTER TABLE "workflow_lineages" ADD COLUMN "slug" TEXT;

WITH base AS (
  SELECT
    id,
    group_id,
    CASE
      WHEN length(trim(both '-' from
        regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))) > 0
      THEN trim(both '-' from
        regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
      ELSE 'workflow'
    END AS base_slug,
    created_at
  FROM "workflow_lineages"
),
ranked AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (
      PARTITION BY group_id, base_slug
      ORDER BY created_at, id
    ) AS rn
  FROM base
)
UPDATE "workflow_lineages" wl
SET slug = CASE
  WHEN r.rn = 1 THEN r.base_slug
  ELSE r.base_slug || '-' || r.rn
END
FROM ranked r
WHERE r.id = wl.id;

ALTER TABLE "workflow_lineages" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "workflow_lineages_group_id_slug_key" ON "workflow_lineages"("group_id", "slug");
