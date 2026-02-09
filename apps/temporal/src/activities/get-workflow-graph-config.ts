import { getPrismaClient } from './database-client';
import type { GraphWorkflowConfig } from '../graph-workflow-types';

/**
 * Activity: Load a graph workflow config by ID or name
 *
 * Used by childWorkflow nodes to load library workflows from the database.
 * First tries to find by ID, then by name if not found.
 */
export async function getWorkflowGraphConfig(input: {
  workflowId: string;
}): Promise<{ graph: GraphWorkflowConfig }> {
  const prisma = getPrismaClient();

  // First try to find by ID
  let workflow = await prisma.workflow.findUnique({
    where: { id: input.workflowId },
    select: { config: true },
  });

  // If not found by ID, try by name
  if (!workflow) {
    workflow = await prisma.workflow.findFirst({
      where: { name: input.workflowId },
      select: { config: true },
    });
  }

  if (!workflow || !workflow.config) {
    throw new Error(`Workflow not found by ID or name: ${input.workflowId}`);
  }

  return { graph: workflow.config as unknown as GraphWorkflowConfig };
}
