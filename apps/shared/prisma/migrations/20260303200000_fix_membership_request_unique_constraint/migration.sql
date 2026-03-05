-- Drop the broad unique constraint that incorrectly prevents a user from being
-- approved more than once (e.g. after being removed and re-applying).
DROP INDEX IF EXISTS "group_membership_request_group_id_user_id_status_key";

-- Replace with a partial unique index: only one PENDING request is allowed per
-- user per group at a time. Historical APPROVED/DENIED/CANCELLED rows are
-- unaffected and multiple can exist for the same user+group combination.
CREATE UNIQUE INDEX "group_membership_request_pending_unique"
  ON "group_membership_request" ("group_id", "user_id")
  WHERE status = 'PENDING';
