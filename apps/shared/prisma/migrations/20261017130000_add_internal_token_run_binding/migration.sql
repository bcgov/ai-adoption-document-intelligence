-- A custom step's (dynamic node's) internal token records the run and the step
-- it was minted for, so the audit trail can follow what the step did to its
-- run, and from the run's start event to who started it. Other tokens leave
-- both null.

-- AlterTable
ALTER TABLE "internal_token" ADD COLUMN     "dynamic_node_slug" TEXT,
ADD COLUMN     "workflow_execution_id" TEXT;
