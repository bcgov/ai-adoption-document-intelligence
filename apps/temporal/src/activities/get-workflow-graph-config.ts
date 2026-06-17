import { applyWorkflowConfigOverrides } from "@ai-di/graph-workflow-config";
import { computeConfigHashWithOverrides } from "../config-hash";
import type { GraphWorkflowConfig } from "../graph-workflow-types";
import { getPrismaClient } from "./database-client";

export interface WorkflowGraphConfigLoaded {
  graph: GraphWorkflowConfig;
  /** Resolved WorkflowVersion.id (cuid). */
  workflowVersionId: string;
  configHash: string;
}

export interface GetWorkflowGraphConfigInput {
  workflowId: string;
  workflowConfigOverrides?: Record<string, unknown>;
}

/**
 * Activity: Load a graph workflow config by version ID, lineage ID, or lineage name.
 *
 * When `workflowConfigOverrides` is set, merges overrides into the loaded config before
 * returning (same paths as benchmark definition overrides).
 *
 * Resolution order: WorkflowVersion.id → WorkflowLineage.id (head) → WorkflowLineage.name (head).
 */
export async function getWorkflowGraphConfig(
  input: GetWorkflowGraphConfigInput,
): Promise<WorkflowGraphConfigLoaded> {
  const prisma = getPrismaClient();
  const overrides = input.workflowConfigOverrides;
  const hasOverrides =
    overrides !== undefined && Object.keys(overrides).length > 0;

  const resolveLoaded = (
    workflowVersionId: string,
    baseConfig: GraphWorkflowConfig,
  ): WorkflowGraphConfigLoaded => {
    const graph = hasOverrides
      ? applyWorkflowConfigOverrides(baseConfig, overrides)
      : baseConfig;
    return {
      graph,
      workflowVersionId,
      configHash: computeConfigHashWithOverrides(baseConfig, overrides),
    };
  };

  const byVersion = await prisma.workflowVersion.findUnique({
    where: { id: input.workflowId },
    select: { id: true, config: true },
  });
  if (byVersion?.config) {
    return resolveLoaded(
      byVersion.id,
      byVersion.config as unknown as GraphWorkflowConfig,
    );
  }

  const lineageById = await prisma.workflowLineage.findUnique({
    where: { id: input.workflowId },
    include: { headVersion: true },
  });
  if (lineageById?.headVersion?.config) {
    return resolveLoaded(
      lineageById.headVersion.id,
      lineageById.headVersion.config as unknown as GraphWorkflowConfig,
    );
  }

  const lineageByName = await prisma.workflowLineage.findFirst({
    where: { name: input.workflowId },
    include: { headVersion: true },
  });
  if (lineageByName?.headVersion?.config) {
    return resolveLoaded(
      lineageByName.headVersion.id,
      lineageByName.headVersion.config as unknown as GraphWorkflowConfig,
    );
  }

  throw new Error(`Workflow not found by ID or name: ${input.workflowId}`);
}
