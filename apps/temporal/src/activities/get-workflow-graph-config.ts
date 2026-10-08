import { applyWorkflowConfigOverrides } from "@ai-di/graph-workflow";
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
  /** Group of the running workflow; only that group's workflows resolve. */
  groupId?: string | null;
  workflowConfigOverrides?: Record<string, unknown>;
}

/**
 * Activity: Load a graph workflow config by version ID, lineage ID, or lineage name,
 * limited to the workflows owned by `groupId`.
 *
 * When `workflowConfigOverrides` is set, merges overrides into the loaded config before
 * returning (same paths as benchmark definition overrides).
 *
 * Resolution order: WorkflowVersion.id → WorkflowLineage.id (head) → WorkflowLineage.name (head).
 */
export async function getWorkflowGraphConfig(
  input: GetWorkflowGraphConfigInput,
): Promise<WorkflowGraphConfigLoaded> {
  const groupId = input.groupId;
  if (!groupId) {
    throw new Error(
      `groupId is required to load workflow: ${input.workflowId}`,
    );
  }
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

  const byVersion = await prisma.workflowVersion.findFirst({
    where: { id: input.workflowId, lineage: { group_id: groupId } },
    select: { id: true, config: true },
  });
  if (byVersion?.config) {
    return resolveLoaded(
      byVersion.id,
      byVersion.config as unknown as GraphWorkflowConfig,
    );
  }

  const lineageById = await prisma.workflowLineage.findFirst({
    where: { id: input.workflowId, group_id: groupId },
    include: { headVersion: true },
  });
  if (lineageById?.headVersion?.config) {
    return resolveLoaded(
      lineageById.headVersion.id,
      lineageById.headVersion.config as unknown as GraphWorkflowConfig,
    );
  }

  const lineageByName = await prisma.workflowLineage.findFirst({
    where: { name: input.workflowId, group_id: groupId },
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
