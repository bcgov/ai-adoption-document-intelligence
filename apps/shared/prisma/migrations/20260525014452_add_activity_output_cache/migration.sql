-- CreateTable
CREATE TABLE "ActivityOutputCache" (
    "id" TEXT NOT NULL,
    "workflowLineageId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outputCtx" JSONB NOT NULL,
    "outputKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityOutputCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityOutputCache_workflowLineageId_nodeId_idx" ON "ActivityOutputCache"("workflowLineageId", "nodeId");

-- CreateIndex
CREATE INDEX "ActivityOutputCache_expiresAt_idx" ON "ActivityOutputCache"("expiresAt");

-- CreateIndex
CREATE INDEX "ActivityOutputCache_workflowLineageId_createdAt_idx" ON "ActivityOutputCache"("workflowLineageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityOutputCache_workflowLineageId_nodeId_configHash_inp_key" ON "ActivityOutputCache"("workflowLineageId", "nodeId", "configHash", "inputHash");
