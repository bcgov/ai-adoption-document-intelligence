-- Rename user_id to generating_user_id on api_keys table.
-- This clarifies the column's purpose: it records the user who generated the
-- key for audit purposes and is not used for authentication identity resolution.
ALTER TABLE "api_keys" RENAME COLUMN "user_id" TO "generating_user_id";
