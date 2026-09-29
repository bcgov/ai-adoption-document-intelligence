import { applyWorkflowConfigOverrides } from "@ai-di/graph-workflow";
import { ApplicationFailure } from "@temporalio/activity";
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
  /**
   * Pin to a specific version number within the lineage (US-080 — library
   * version pinning). When set, resolves the (lineage_id, version_number)
   * pair to that exact `WorkflowVersion`; when omitted, falls back to head
   * resolution.
   */
  version?: number;
  workflowConfigOverrides?: Record<string, unknown>;
  /**
   * G-019 — the id of the `childWorkflow` node that asked for this config.
   * Only used to name the offending step in the resolution-failure message,
   * so an operator can find it on the canvas without reading the graph JSON.
   */
  parentNodeId?: string;
}

/**
 * `ApplicationFailure` type for "the referenced library workflow is not
 * there" (G-019). See `notFound` below for why it is non-retryable.
 */
const LIBRARY_WORKFLOW_NOT_FOUND = "LIBRARY_WORKFLOW_NOT_FOUND";

/**
 * G-019 — a library child that cannot be resolved is a PERMANENT failure:
 * the workflow was deleted, renamed, or its pinned version no longer
 * exists, and no amount of retrying will bring it back. As a plain `Error`
 * this was retryable, so the calling `childWorkflow` node burned its entire
 * retry budget against a condition that can never resolve, and the run's
 * real cause was buried under identical attempt failures. `nonRetryable`
 * surfaces it on the first attempt with the missing ref and the parent node
 * named.
 */
function notFound(message: string, parentNodeId?: string): ApplicationFailure {
  return ApplicationFailure.create({
    type: LIBRARY_WORKFLOW_NOT_FOUND,
    message:
      parentNodeId === undefined
        ? message
        : `${message} (referenced by child-workflow node "${parentNodeId}")`,
    nonRetryable: true,
  });
}

/**
 * Activity: Load a graph workflow config by version ID, lineage ID, or lineage name.
 *
 * Used by childWorkflow nodes to load library workflows from the database.
 *
 * When `version` is provided, resolves the lineage-id + version-number pair to
 * that specific `WorkflowVersion` row's config (US-080 — library version
 * pinning). When omitted, falls back to head resolution:
 * WorkflowVersion.id → WorkflowLineage.id (head) → WorkflowLineage.name (head).
 *
 * When `workflowConfigOverrides` is set, merges overrides into the loaded
 * config before returning (same paths as benchmark definition overrides).
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

  if (input.version !== undefined) {
    // §3.5: a childWorkflow ref is free-text and may be a lineage id OR a
    // lineage NAME (the head-resolution fallbacks below accept both). The
    // pinned path previously used the raw ref directly as `lineage_id`, so a
    // name-referenced child resolved fine until a version pin was added, then
    // threw `has no version N`. Resolve the ref to a lineage id first.
    const lineage =
      (await prisma.workflowLineage.findUnique({
        where: { id: input.workflowId },
        select: { id: true },
      })) ??
      (await prisma.workflowLineage.findFirst({
        where: { name: input.workflowId },
        select: { id: true },
      }));
    if (lineage === null) {
      throw notFound(
        `Library lineage not found: ${input.workflowId}`,
        input.parentNodeId,
      );
    }
    const pinned = await prisma.workflowVersion.findUnique({
      where: {
        lineage_id_version_number: {
          lineage_id: lineage.id,
          version_number: input.version,
        },
      },
      select: { id: true, config: true },
    });
    if (pinned?.config) {
      return resolveLoaded(
        pinned.id,
        pinned.config as unknown as GraphWorkflowConfig,
      );
    }
    throw notFound(
      `Library lineage ${input.workflowId} has no version ${input.version}`,
      input.parentNodeId,
    );
  }

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

  throw notFound(
    `Workflow not found by ID or name: ${input.workflowId}`,
    input.parentNodeId,
  );
}
