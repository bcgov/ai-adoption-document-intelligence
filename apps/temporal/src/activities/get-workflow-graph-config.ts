import type { GraphWorkflowConfig } from "../graph-workflow-types";
import { getPrismaClient } from "./database-client";

/**
 * Activity: Load a graph workflow config by version ID, lineage ID, or lineage name
 *
 * Used by childWorkflow nodes to load library workflows from the database.
 * Resolution order: WorkflowVersion.id → WorkflowLineage.id (head) → WorkflowLineage.name (head).
 */
export async function getWorkflowGraphConfig(input: {
  workflowId: string;
}): Promise<{ graph: GraphWorkflowConfig }> {
  const prisma = getPrismaClient();

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
