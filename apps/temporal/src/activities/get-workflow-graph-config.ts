import type { GraphWorkflowConfig } from "../graph-workflow-types";
import { getPrismaClient } from "./database-client";

/**
 * Activity: Load a graph workflow config by version ID, lineage ID, or lineage name
 *
 * Used by childWorkflow nodes to load library workflows from the database.
 *
 * When `version` is provided, resolves the lineage-id + version-number pair to
 * that specific `WorkflowVersion` row's config (US-080 — library version
 * pinning). When `version` is omitted, falls back to the legacy 3-step
 * resolution: WorkflowVersion.id → WorkflowLineage.id (head) →
 * WorkflowLineage.name (head).
 */
export async function getWorkflowGraphConfig(input: {
  workflowId: string;
  version?: number;
}): Promise<{ graph: GraphWorkflowConfig }> {
  const prisma = getPrismaClient();

  if (input.version !== undefined) {
    const pinned = await prisma.workflowVersion.findFirst({
      where: {
        lineage_id: input.workflowId,
        version_number: input.version,
      },
      select: { config: true },
    });
    if (pinned?.config) {
      return { graph: pinned.config as unknown as GraphWorkflowConfig };
    }
    throw new Error(
      `Library lineage ${input.workflowId} has no version ${input.version}`,
    );
  }

  const byVersion = await prisma.workflowVersion.findUnique({
    where: { id: input.workflowId },
    select: { config: true },
  });
  if (byVersion?.config) {
    return { graph: byVersion.config as unknown as GraphWorkflowConfig };
  }

  const lineageById = await prisma.workflowLineage.findUnique({
    where: { id: input.workflowId },
    include: { headVersion: true },
  });
  if (lineageById?.headVersion?.config) {
    return {
      graph: lineageById.headVersion.config as unknown as GraphWorkflowConfig,
    };
  }

  const lineageByName = await prisma.workflowLineage.findFirst({
    where: { name: input.workflowId },
    include: { headVersion: true },
  });
  if (lineageByName?.headVersion?.config) {
    return {
      graph: lineageByName.headVersion.config as unknown as GraphWorkflowConfig,
    };
  }

  throw new Error(`Workflow not found by ID or name: ${input.workflowId}`);
}
