/**
 * Workflow Modification Utility (backend)
 *
 * Applies AI tool recommendations to a graph config by inserting
 * correction nodes. Duplicates `apps/temporal/src/workflow-modification/workflow-modification.util.ts`
 * so the Nest API can build candidate graphs without importing the worker bundle.
 * Keep behavior aligned with that file (shared `@ai-di/graph-insertion-slots` helps).
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-04-benchmark-integration-workflow-comparison.md
 */

import type {
  ActivityNode,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "./graph-workflow-types";
import { isOcrCorrectionInsertionEdgeSourceAllowed } from "./insertion-slots.util";

export interface ToolRecommendation {
  toolId: string;
  parameters: Record<string, unknown>;
  insertionPoint: {
    afterNodeId?: string;
    beforeNodeId?: string;
  };
  rationale: string;
  priority: number;
}

export interface WorkflowModificationResult {
  newConfig: GraphWorkflowConfig;
  appliedRecommendations: ToolRecommendation[];
  rejectedRecommendations: Array<{
    recommendation: ToolRecommendation;
    reason: string;
  }>;
}

function generateNodeId(toolId: string, index: number): string {
  const suffix = toolId.replace(/\./g, "_");
  return `correction_${suffix}_${index}`;
}

function generateEdgeId(source: string, target: string): string {
  return `edge_${source}_to_${target}`;
}

function getNodePortBindings(node: GraphNode | undefined): {
  inputs: { ctxKey: string }[];
  outputs: { ctxKey: string }[];
} {
  if (!node) {
    return { inputs: [], outputs: [] };
  }
  return {
    inputs: node.inputs ?? [],
    outputs: node.outputs ?? [],
  };
}

/**
 * Infer which ctx key flows along the edge being split (source → target) so
 * correction nodes use the same bindings as the rest of the pipeline.
 * Falls back to cleanedResult / ocrResult when the graph omits port metadata.
 */
function inferPipelineCtxKeyForSplit(
  config: GraphWorkflowConfig,
  splitSourceNodeId: string,
  targetNodeId: string,
): string {
  const ctx = config.ctx ?? {};
  const source = config.nodes[splitSourceNodeId];
  const target = config.nodes[targetNodeId];
  const sourceOut = new Set(
    getNodePortBindings(source).outputs.map((o) => o.ctxKey),
  );
  const targetInKeys = getNodePortBindings(target).inputs.map((i) => i.ctxKey);

  for (const k of targetInKeys) {
    if (sourceOut.has(k)) {
      return k;
    }
  }
  for (const k of targetInKeys) {
    if (k in ctx) {
      return k;
    }
  }
  const firstOut = getNodePortBindings(source).outputs[0]?.ctxKey;
  if (firstOut) {
    return firstOut;
  }
  if ("cleanedResult" in ctx) {
    return "cleanedResult";
  }
  if ("ocrResult" in ctx) {
    return "ocrResult";
  }
  return "cleanedResult";
}

/** Ensure save-time graph validation passes for port bindings. */
function ensureCtxKeyDeclared(config: GraphWorkflowConfig, key: string): void {
  if (!config.ctx) {
    config.ctx = {};
  }
  if (!(key in config.ctx)) {
    config.ctx[key] = {
      type: "object",
      description: "OCR pipeline payload (declared for correction node)",
    };
  }
}

function findEdgeBetween(
  edges: GraphEdge[],
  sourceNodeId: string,
  targetNodeId: string,
): GraphEdge | undefined {
  return edges.find(
    (e) => e.source === sourceNodeId && e.target === targetNodeId,
  );
}

function findOutgoingEdges(
  edges: GraphEdge[],
  sourceNodeId: string,
): GraphEdge[] {
  return edges.filter((e) => e.source === sourceNodeId);
}

function findLastNormalEdgeBeforeNode(
  edges: GraphEdge[],
  afterNodeId: string,
  beforeNodeId: string,
): GraphEdge | undefined {
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (edge.type !== "normal") continue;
    const current = adjacency.get(edge.source) ?? [];
    current.push(edge);
    adjacency.set(edge.source, current);
  }

  const visited = new Set<string>([afterNodeId]);
  const queue: string[] = [afterNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const outgoing = adjacency.get(nodeId) ?? [];
    for (const edge of outgoing) {
      if (edge.target === beforeNodeId) {
        return edge;
      }
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  return undefined;
}

function findNodeIdCaseInsensitive(
  nodes: Record<string, unknown>,
  requestedId: string,
): string | null {
  const lower = requestedId.toLowerCase();
  for (const k of Object.keys(nodes)) {
    if (k.toLowerCase() === lower) return k;
  }
  return null;
}

/**
 * Resolve insertion point node id to a key in `nodes`: exact match, else case-insensitive.
 */
function resolveNodeId(
  nodes: Record<string, unknown>,
  requestedId: string,
): string | null {
  if (requestedId in nodes) return requestedId;
  return findNodeIdCaseInsensitive(nodes, requestedId);
}

/**
 * Apply a list of tool recommendations to a graph config.
 * Insertion points must use node ids that exist in the graph (see Temporal `applyRecommendations`).
 */
export function applyRecommendations(
  config: GraphWorkflowConfig,
  recommendations: ToolRecommendation[],
): WorkflowModificationResult {
  const newConfig: GraphWorkflowConfig = JSON.parse(JSON.stringify(config));
  const applied: ToolRecommendation[] = [];
  const rejected: Array<{
    recommendation: ToolRecommendation;
    reason: string;
  }> = [];

  const insertedToolsAtPoint = new Set<string>();

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    const requestedAfter = rec.insertionPoint.afterNodeId;
    const requestedBefore = rec.insertionPoint.beforeNodeId;

    if (!requestedAfter) {
      rejected.push({
        recommendation: rec,
        reason: "insertionPoint.afterNodeId is required",
      });
      continue;
    }

    const afterNodeId =
      resolveNodeId(newConfig.nodes, requestedAfter) ?? requestedAfter;
    const beforeNodeId = requestedBefore
      ? (resolveNodeId(newConfig.nodes, requestedBefore) ?? requestedBefore)
      : undefined;

    if (!newConfig.nodes[afterNodeId]) {
      rejected.push({
        recommendation: rec,
        reason: `Node "${requestedAfter}" not found in graph (resolved: ${afterNodeId})`,
      });
      continue;
    }

    const pointKey = `${rec.toolId}@${afterNodeId}->${beforeNodeId ?? "*"}`;
    if (insertedToolsAtPoint.has(pointKey)) {
      rejected.push({
        recommendation: rec,
        reason: `Tool "${rec.toolId}" already inserted at this point`,
      });
      continue;
    }

    let splitSourceNodeId: string;
    let targetNodeId: string;
    let edgeToSplit: GraphEdge | undefined;

    if (beforeNodeId) {
      if (!newConfig.nodes[beforeNodeId]) {
        rejected.push({
          recommendation: rec,
          reason: `Node "${beforeNodeId}" not found in graph`,
        });
        continue;
      }

      edgeToSplit = findEdgeBetween(newConfig.edges, afterNodeId, beforeNodeId);
      if (!edgeToSplit) {
        edgeToSplit = findLastNormalEdgeBeforeNode(
          newConfig.edges,
          afterNodeId,
          beforeNodeId,
        );
      }
      if (!edgeToSplit) {
        rejected.push({
          recommendation: rec,
          reason: `No edge found from "${afterNodeId}" to "${beforeNodeId}"`,
        });
        continue;
      }
      splitSourceNodeId = edgeToSplit.source;
      targetNodeId = beforeNodeId;
    } else {
      const outgoing = findOutgoingEdges(newConfig.edges, afterNodeId);
      if (outgoing.length === 0) {
        rejected.push({
          recommendation: rec,
          reason: `No outgoing edges from "${afterNodeId}"`,
        });
        continue;
      }
      edgeToSplit = outgoing[0];
      splitSourceNodeId = edgeToSplit.source;
      targetNodeId = edgeToSplit.target;
    }

    if (
      !isOcrCorrectionInsertionEdgeSourceAllowed(newConfig, splitSourceNodeId)
    ) {
      rejected.push({
        recommendation: rec,
        reason: `OCR correction tools must run only after Azure OCR extract; edge source "${splitSourceNodeId}" is upstream of azureOcr.extract`,
      });
      continue;
    }

    const newNodeId = generateNodeId(rec.toolId, i);

    const pipelineCtxKey = inferPipelineCtxKeyForSplit(
      newConfig,
      splitSourceNodeId,
      targetNodeId,
    );
    ensureCtxKeyDeclared(newConfig, pipelineCtxKey);

    const newNode: ActivityNode = {
      id: newNodeId,
      type: "activity",
      label: `${rec.toolId} (AI-recommended)`,
      activityType: rec.toolId,
      parameters: rec.parameters,
      inputs: [{ port: "ocrResult", ctxKey: pipelineCtxKey }],
      outputs: [{ port: "ocrResult", ctxKey: pipelineCtxKey }],
      retry: { maximumAttempts: 2 },
      timeout: { startToClose: "2m" },
    };

    newConfig.nodes[newNodeId] = newNode;

    const edgeIndex = newConfig.edges.indexOf(edgeToSplit);
    if (edgeIndex !== -1) {
      newConfig.edges.splice(edgeIndex, 1);
    }

    newConfig.edges.push({
      id: generateEdgeId(splitSourceNodeId, newNodeId),
      source: splitSourceNodeId,
      target: newNodeId,
      type: "normal",
    });

    newConfig.edges.push({
      id: generateEdgeId(newNodeId, targetNodeId),
      source: newNodeId,
      target: targetNodeId,
      type: "normal",
    });

    insertedToolsAtPoint.add(pointKey);
    applied.push(rec);
  }

  return {
    newConfig,
    appliedRecommendations: applied,
    rejectedRecommendations: rejected,
  };
}

/** Matches `EmptyValueCoercionMode` in `ocr.normalizeFields` (Temporal). */
export type OcrNormalizeFieldsEmptyValueCoercion = "none" | "blank" | "null";

/**
 * Sets `parameters.emptyValueCoercion` on every `ocr.normalizeFields` activity node.
 * Used by the OCR improvement pipeline when the client requests a fixed coercion mode
 * for the candidate workflow (overrides values from the source graph and from AI parameters).
 */
export function applyOcrNormalizeFieldsEmptyValueCoercion(
  config: GraphWorkflowConfig,
  mode: OcrNormalizeFieldsEmptyValueCoercion,
): GraphWorkflowConfig {
  const newConfig: GraphWorkflowConfig = JSON.parse(JSON.stringify(config));
  for (const node of Object.values(newConfig.nodes)) {
    if (node.type !== "activity") continue;
    const activity = node as ActivityNode;
    if (activity.activityType !== "ocr.normalizeFields") continue;
    activity.parameters = {
      ...(activity.parameters ?? {}),
      emptyValueCoercion: mode,
    };
  }
  return newConfig;
}
