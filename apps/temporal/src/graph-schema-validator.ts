/**
 * Temporal Worker Graph Schema Validator
 *
 * Validates GraphWorkflowConfig at execution time as a defensive check
 * before the graph runner begins processing nodes. Validates against the
 * actual runtime activity registry.
 *
 * Must be deterministic: no I/O, no Date.now().
 *
 * See docs/DAG_WORKFLOW_ENGINE.md Section 5.2 step 1
 */

import type {
  GraphWorkflowConfig,
  GraphValidationError,
  ConditionExpression,
  SwitchNode,
  MapNode,
  JoinNode,
  ActivityNode,
  PollUntilNode,
  ValueRef,
} from "./graph-workflow-types";
import type { ActivityRegistryEntry } from "./activity-registry";

const SUPPORTED_SCHEMA_VERSIONS = ["1.0"];

const VALID_COMPARISON_OPERATORS = [
  "equals",
  "not-equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
];
const VALID_LOGICAL_OPERATORS = ["and", "or"];
const VALID_NULL_CHECK_OPERATORS = ["is-null", "is-not-null"];
const VALID_LIST_MEMBERSHIP_OPERATORS = ["in", "not-in"];
const ALL_VALID_OPERATORS = [
  ...VALID_COMPARISON_OPERATORS,
  ...VALID_LOGICAL_OPERATORS,
  "not",
  ...VALID_NULL_CHECK_OPERATORS,
  ...VALID_LIST_MEMBERSHIP_OPERATORS,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a graph config for execution in the Temporal worker.
 * Uses the runtime activity registry for stronger validation.
 *
 * @param config The graph workflow configuration to validate
 * @param registry The runtime activity registry (actual functions available)
 * @returns Validation result with errors
 */
export function validateGraphConfigForExecution(
  config: GraphWorkflowConfig,
  registry: ReadonlyMap<string, ActivityRegistryEntry>,
): {
  valid: boolean;
  errors: GraphValidationError[];
} {
  const errors: GraphValidationError[] = [];

  if (!config || typeof config !== "object") {
    errors.push({
      path: "",
      message: "Config must be a non-null object",
      severity: "error",
    });
    return { valid: false, errors };
  }

  validateSchemaVersion(config, errors);
  validateNodesExist(config, errors);

  if (!config.nodes || Object.keys(config.nodes).length === 0) {
    return { valid: errors.every((e) => e.severity === "warning"), errors };
  }

  validateNodeIds(config, errors);
  validateEntryNode(config, errors);
  validateEdges(config, errors);
  validateActivityTypesAgainstRegistry(config, registry, errors);
  validateSwitchNodes(config, errors);
  validateMapJoinNodes(config, errors);
  validatePortBindings(config, errors);
  validateExpressions(config, errors);
  validateDagStructure(config, errors);
  validateReachability(config, errors);

  return {
    valid: errors.filter((e) => e.severity === "error").length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

function validateSchemaVersion(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(config.schemaVersion)) {
    errors.push({
      path: "schemaVersion",
      message: `Unsupported schema version: "${config.schemaVersion}". Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
      severity: "error",
    });
  }
}

function validateNodesExist(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (!config.nodes || Object.keys(config.nodes).length === 0) {
    errors.push({
      path: "nodes",
      message: "Graph must contain at least one node",
      severity: "error",
    });
  }
}

function validateNodeIds(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const nodeIds = new Set<string>();
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.id !== nodeId) {
      errors.push({
        path: `nodes.${nodeId}`,
        message: `Node id "${node.id}" does not match its key "${nodeId}"`,
        severity: "error",
      });
    }

    if (nodeIds.has(nodeId)) {
      errors.push({
        path: `nodes.${nodeId}`,
        message: `Duplicate node ID: "${nodeId}"`,
        severity: "error",
      });
    }
    nodeIds.add(nodeId);
  }
}

function validateEntryNode(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (!config.entryNodeId) {
    errors.push({
      path: "entryNodeId",
      message: "entryNodeId is required",
      severity: "error",
    });
    return;
  }

  if (!(config.entryNodeId in config.nodes)) {
    errors.push({
      path: "entryNodeId",
      message: `Entry node "${config.entryNodeId}" not found in nodes`,
      severity: "error",
    });
    return;
  }

  const incomingEdges = (config.edges || []).filter(
    (e) => e.target === config.entryNodeId,
  );
  if (incomingEdges.length > 0) {
    errors.push({
      path: "entryNodeId",
      message: `Entry node "${config.entryNodeId}" must not have incoming edges`,
      severity: "error",
    });
  }
}

function validateEdges(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (!config.edges) return;

  const edgeIds = new Set<string>();
  const nodeIds = new Set(Object.keys(config.nodes));

  for (let i = 0; i < config.edges.length; i++) {
    const edge = config.edges[i];

    if (edgeIds.has(edge.id)) {
      errors.push({
        path: `edges[${i}]`,
        message: `Duplicate edge ID: "${edge.id}"`,
        severity: "error",
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      errors.push({
        path: `edges[${i}].source`,
        message: `Edge "${edge.id}" references non-existent source node: "${edge.source}"`,
        severity: "error",
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        path: `edges[${i}].target`,
        message: `Edge "${edge.id}" references non-existent target node: "${edge.target}"`,
        severity: "error",
      });
    }
  }
}

/**
 * Validates activity types against the runtime registry.
 * This is stronger than the backend constant-based check because it verifies
 * the worker can actually execute the referenced activities.
 */
function validateActivityTypesAgainstRegistry(
  config: GraphWorkflowConfig,
  registry: ReadonlyMap<string, ActivityRegistryEntry>,
  errors: GraphValidationError[],
): void {
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type === "activity") {
      const activityNode = node as ActivityNode;
      if (!registry.has(activityNode.activityType)) {
        errors.push({
          path: `nodes.${nodeId}.activityType`,
          message: `Activity type "${activityNode.activityType}" is not registered in the runtime activity registry`,
          severity: "error",
        });
      }
    }

    if (node.type === "pollUntil") {
      const pollNode = node as PollUntilNode;
      if (!registry.has(pollNode.activityType)) {
        errors.push({
          path: `nodes.${nodeId}.activityType`,
          message: `Activity type "${pollNode.activityType}" is not registered in the runtime activity registry`,
          severity: "error",
        });
      }
    }
  }
}

function validateSwitchNodes(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const edgeIds = new Set((config.edges || []).map((e) => e.id));

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "switch") continue;
    const switchNode = node as SwitchNode;

    if (!switchNode.defaultEdge) {
      errors.push({
        path: `nodes.${nodeId}.defaultEdge`,
        message: `Switch node "${nodeId}" must have a defaultEdge`,
        severity: "error",
      });
    } else if (!edgeIds.has(switchNode.defaultEdge)) {
      errors.push({
        path: `nodes.${nodeId}.defaultEdge`,
        message: `Switch node "${nodeId}" defaultEdge "${switchNode.defaultEdge}" does not reference an existing edge`,
        severity: "error",
      });
    }

    if (switchNode.cases) {
      for (let i = 0; i < switchNode.cases.length; i++) {
        const switchCase = switchNode.cases[i];
        if (!edgeIds.has(switchCase.edgeId)) {
          errors.push({
            path: `nodes.${nodeId}.cases[${i}].edgeId`,
            message: `Switch case edge "${switchCase.edgeId}" does not reference an existing edge`,
            severity: "error",
          });
        }
      }
    }
  }
}

function validateMapJoinNodes(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const nodeIds = new Set(Object.keys(config.nodes));

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type === "map") {
      const mapNode = node as MapNode;

      if (!nodeIds.has(mapNode.bodyEntryNodeId)) {
        errors.push({
          path: `nodes.${nodeId}.bodyEntryNodeId`,
          message: `Map node "${nodeId}" references non-existent bodyEntryNodeId: "${mapNode.bodyEntryNodeId}"`,
          severity: "error",
        });
      }
      if (!nodeIds.has(mapNode.bodyExitNodeId)) {
        errors.push({
          path: `nodes.${nodeId}.bodyExitNodeId`,
          message: `Map node "${nodeId}" references non-existent bodyExitNodeId: "${mapNode.bodyExitNodeId}"`,
          severity: "error",
        });
      }
    }

    if (node.type === "join") {
      const joinNode = node as JoinNode;

      if (!nodeIds.has(joinNode.sourceMapNodeId)) {
        errors.push({
          path: `nodes.${nodeId}.sourceMapNodeId`,
          message: `Join node "${nodeId}" references non-existent sourceMapNodeId: "${joinNode.sourceMapNodeId}"`,
          severity: "error",
        });
      } else {
        const referencedNode = config.nodes[joinNode.sourceMapNodeId];
        if (referencedNode && referencedNode.type !== "map") {
          errors.push({
            path: `nodes.${nodeId}.sourceMapNodeId`,
            message: `Join node "${nodeId}" sourceMapNodeId "${joinNode.sourceMapNodeId}" references a "${referencedNode.type}" node, not a "map" node`,
            severity: "error",
          });
        }
      }
    }
  }
}

function validatePortBindings(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (!config.ctx) return;

  const declaredCtxKeys = new Set(Object.keys(config.ctx));

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.inputs) {
      for (let i = 0; i < node.inputs.length; i++) {
        const binding = node.inputs[i];
        const rootKey = binding.ctxKey.split(".")[0];
        if (!declaredCtxKeys.has(rootKey)) {
          errors.push({
            path: `nodes.${nodeId}.inputs[${i}].ctxKey`,
            message: `Port binding references undeclared ctx key: "${binding.ctxKey}" (root key "${rootKey}" not in ctx declarations)`,
            severity: "error",
          });
        }
      }
    }

    if (node.outputs) {
      for (let i = 0; i < node.outputs.length; i++) {
        const binding = node.outputs[i];
        const rootKey = binding.ctxKey.split(".")[0];
        if (!declaredCtxKeys.has(rootKey)) {
          errors.push({
            path: `nodes.${nodeId}.outputs[${i}].ctxKey`,
            message: `Port binding references undeclared ctx key: "${binding.ctxKey}" (root key "${rootKey}" not in ctx declarations)`,
            severity: "error",
          });
        }
      }
    }
  }
}

function validateExpressions(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const declaredCtxKeys = config.ctx ? new Set(Object.keys(config.ctx)) : new Set<string>();

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type === "switch") {
      const switchNode = node as SwitchNode;
      if (switchNode.cases) {
        for (let i = 0; i < switchNode.cases.length; i++) {
          validateExpression(
            switchNode.cases[i].condition,
            `nodes.${nodeId}.cases[${i}].condition`,
            declaredCtxKeys,
            errors,
          );
        }
      }
    }

    if (node.type === "pollUntil") {
      const pollNode = node as PollUntilNode;
      if (pollNode.condition) {
        validateExpression(
          pollNode.condition,
          `nodes.${nodeId}.condition`,
          declaredCtxKeys,
          errors,
        );
      }
    }
  }
}

function validateExpression(
  expr: ConditionExpression,
  path: string,
  declaredCtxKeys: Set<string>,
  errors: GraphValidationError[],
): void {
  if (!expr || typeof expr !== "object") {
    errors.push({
      path,
      message: "Expression must be a non-null object",
      severity: "error",
    });
    return;
  }

  if (!("operator" in expr) || !ALL_VALID_OPERATORS.includes(expr.operator)) {
    errors.push({
      path: `${path}.operator`,
      message: `Unknown expression operator: "${(expr as { operator?: string }).operator}"`,
      severity: "error",
    });
    return;
  }

  if (VALID_COMPARISON_OPERATORS.includes(expr.operator)) {
    const compExpr = expr as { left: ValueRef; right: ValueRef };
    validateValueRef(compExpr.left, `${path}.left`, declaredCtxKeys, errors);
    validateValueRef(compExpr.right, `${path}.right`, declaredCtxKeys, errors);
  }

  if (VALID_LOGICAL_OPERATORS.includes(expr.operator)) {
    const logExpr = expr as { operands: ConditionExpression[] };
    if (logExpr.operands && Array.isArray(logExpr.operands)) {
      for (let i = 0; i < logExpr.operands.length; i++) {
        validateExpression(
          logExpr.operands[i],
          `${path}.operands[${i}]`,
          declaredCtxKeys,
          errors,
        );
      }
    }
  }

  if (expr.operator === "not") {
    const notExpr = expr as { operand: ConditionExpression };
    if (notExpr.operand) {
      validateExpression(
        notExpr.operand,
        `${path}.operand`,
        declaredCtxKeys,
        errors,
      );
    }
  }

  if (VALID_NULL_CHECK_OPERATORS.includes(expr.operator)) {
    const nullExpr = expr as { value: ValueRef };
    validateValueRef(nullExpr.value, `${path}.value`, declaredCtxKeys, errors);
  }

  if (VALID_LIST_MEMBERSHIP_OPERATORS.includes(expr.operator)) {
    const listExpr = expr as { value: ValueRef; list: ValueRef };
    validateValueRef(listExpr.value, `${path}.value`, declaredCtxKeys, errors);
    validateValueRef(listExpr.list, `${path}.list`, declaredCtxKeys, errors);
  }
}

function validateValueRef(
  ref: ValueRef,
  path: string,
  declaredCtxKeys: Set<string>,
  errors: GraphValidationError[],
): void {
  if (!ref || typeof ref !== "object") return;

  if ("ref" in ref && ref.ref) {
    const parts = ref.ref.split(".");
    const namespace = parts[0];
    let rootCtxKey: string | undefined;

    if (namespace === "ctx" && parts.length >= 2) {
      rootCtxKey = parts[1];
    } else if (namespace === "doc") {
      rootCtxKey = "documentMetadata";
    } else if (namespace === "segment") {
      rootCtxKey = "currentSegment";
    }

    if (rootCtxKey && !declaredCtxKeys.has(rootCtxKey)) {
      errors.push({
        path,
        message: `Expression references undeclared ctx key: "${ref.ref}" (root key "${rootCtxKey}" not in ctx declarations)`,
        severity: "error",
      });
    }
  }
}

function validateDagStructure(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const adjacency = new Map<string, string[]>();
  for (const nodeId of Object.keys(config.nodes)) {
    adjacency.set(nodeId, []);
  }

  for (const edge of config.edges || []) {
    if (edge.source in config.nodes && edge.target in config.nodes) {
      adjacency.get(edge.source)!.push(edge.target);
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const colors = new Map<string, number>();
  for (const nodeId of Object.keys(config.nodes)) {
    colors.set(nodeId, WHITE);
  }

  function dfs(nodeId: string): boolean {
    colors.set(nodeId, GRAY);
    for (const neighbor of adjacency.get(nodeId) || []) {
      if (colors.get(neighbor) === GRAY) return true;
      if (colors.get(neighbor) === WHITE) {
        if (dfs(neighbor)) return true;
      }
    }
    colors.set(nodeId, BLACK);
    return false;
  }

  for (const nodeId of Object.keys(config.nodes)) {
    if (colors.get(nodeId) === WHITE) {
      if (dfs(nodeId)) {
        errors.push({
          path: "edges",
          message: "Cycle detected in graph",
          severity: "error",
        });
        return;
      }
    }
  }
}

function validateReachability(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (!config.entryNodeId || !(config.entryNodeId in config.nodes)) return;

  const adjacency = new Map<string, string[]>();
  for (const nodeId of Object.keys(config.nodes)) {
    adjacency.set(nodeId, []);
  }
  for (const edge of config.edges || []) {
    if (edge.source in config.nodes && edge.target in config.nodes) {
      adjacency.get(edge.source)!.push(edge.target);
    }
  }

  const visited = new Set<string>();
  const queue = [config.entryNodeId];
  visited.add(config.entryNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Consider map body nodes as reachable if parent map is reachable
  for (const [, node] of Object.entries(config.nodes)) {
    if (node.type === "map") {
      const mapNode = node as MapNode;
      if (visited.has(node.id)) {
        if (mapNode.bodyEntryNodeId in config.nodes) {
          markBodyNodesReachable(mapNode.bodyEntryNodeId, adjacency, visited, config);
        }
      }
    }
  }

  for (const nodeId of Object.keys(config.nodes)) {
    if (!visited.has(nodeId)) {
      errors.push({
        path: `nodes.${nodeId}`,
        message: `Node "${nodeId}" is not reachable from entry node "${config.entryNodeId}"`,
        severity: "warning",
      });
    }
  }
}

function markBodyNodesReachable(
  entryNodeId: string,
  adjacency: Map<string, string[]>,
  visited: Set<string>,
  config: GraphWorkflowConfig,
): void {
  const queue = [entryNodeId];
  visited.add(entryNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    const node = config.nodes[current];
    if (node && node.type === "map") {
      const mapNode = node as MapNode;
      if (mapNode.bodyEntryNodeId in config.nodes && !visited.has(mapNode.bodyEntryNodeId)) {
        markBodyNodesReachable(mapNode.bodyEntryNodeId, adjacency, visited, config);
      }
    }
  }
}
