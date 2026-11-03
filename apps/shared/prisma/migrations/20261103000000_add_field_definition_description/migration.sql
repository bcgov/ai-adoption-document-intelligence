-- A plain-English description of each field, used as instructions when an LLM
-- suggests fields and labels. Optional: existing fields keep a null description.
ALTER TABLE "field_definitions" ADD COLUMN "description" TEXT;
