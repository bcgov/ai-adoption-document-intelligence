import { getPrismaClient } from './database-client';
import type { GraphWorkflowConfig } from '../graph-workflow-types';

/**
 * Activity: Load a graph workflow config by ID
 *
 * Used by childWorkflow nodes to load library workflows from the database.
 */
export async function getWorkflowGraphConfig(input: {
  workflowId: string;
}): Promise<{ graph: GraphWorkflowConfig }> {
  const prisma = getPrismaClient();
  const workflow = await prisma.workflow.findUnique({
    where: { id: input.workflowId },
    select: { config: true },
  });

  if (!workflow || !workflow.config) {
    throw new Error(`Workflow not found: ${input.workflowId}`);
  }

  return { graph: workflow.config as unknown as GraphWorkflowConfig };
}
