/**
 * Graph Workflow Schema Validator
 *
 * Validates GraphWorkflowConfig with comprehensive checks: schema version,
 * node/edge integrity, DAG structure (cycle detection), reachability,
 * switch/map/join cross-references, port bindings, expression validation,
 * and activity type validation.
 *
 * Activity registry checks are injected via options so each app supplies
 * its own registry without duplicating the shared validation logic.
 *
 * Must be deterministic: no I/O, no Date.now().
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md
 */

import type {
  ActivityNode,
  ConditionExpression,
  GraphNode,
  GraphValidationError,
  GraphWorkflowConfig,
  HumanGateNode,
  JoinNode,
  LibraryPortDescriptor,
  MapNode,
  PollUntilNode,
  SourceNode,
  SwitchNode,
  ValueRef,
} from "../types";
import { getActivityCatalogEntry } from "../catalog";
import {
  getSourceCatalogEntry as defaultGetSourceCatalogEntry,
} from "../catalog/source-catalog";
import type {
  FieldDescriptor,
  SourceCatalogEntry,
} from "../catalog/source-types";
import type { KindRef } from "../types/artifacts";
import { isAssignable } from "../types/subtype-check";
import { getCtxRootKey, getRefCtxRootKey } from "./context-utils";
import { isValidTemporalDuration } from "./duration";

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
 * Options injected by each app to supply its own activity registry.
 * This is the only genuine difference between apps — all other validation
 * logic is identical.
 */
export interface ValidateGraphConfigOptions {
  /** Return true if the given activity type string is registered in the calling app's registry. */
  isRegisteredActivityType: (type: string) => boolean;
  /**
   * Validate per-activity parameters. Called only for registered activity types.
   * Should push any errors into the provided array.
   */
  validateActivityParameters: (
    activityType: string,
    nodeId: string,
    parameters: Record<string, unknown> | undefined,
    errors: GraphValidationError[],
  ) => void;
  /**
   * Optional lookup for source catalog entries. Defaults to the
   * imported `getSourceCatalogEntry` against the package-level
   * `SOURCE_CATALOG`. Tests inject a synthetic catalog by passing a
   * custom lookup function (mirrors the activity validator pattern
   * without requiring `jest.doMock` on the frozen catalog).
   */
  getSourceCatalogEntry?: (sourceType: string) => SourceCatalogEntry | undefined;
}

/**
 * Validate a graph workflow config.
 *
 * @param config - The graph workflow configuration to validate.
 * @param options - Activity registry callbacks; injected by each app.
 * @returns Validation result with an errors array.
 */
export function validateGraphConfig(
  config: GraphWorkflowConfig,
  options: ValidateGraphConfigOptions,
): { valid: boolean; errors: GraphValidationError[] } {
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
  validateErrorPolicies(config, errors);
  validateActivityTypes(config, errors, options);
  validateSourceNodes(config, errors, options);
  validateSwitchNodes(config, errors);
  validateMapJoinNodes(config, errors);
  validatePortBindings(config, errors);
  validateExpressions(config, errors);
  validateDurations(config, errors);
  validateDagStructure(config, errors);
  validateReachability(config, errors);
  validateNodeGroups(config, errors);
  walkCtxKeyBindings(config, errors, options);
  walkLibraryPaths(config, errors);

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

function validateErrorPolicies(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const edgesById = new Map(
    (config.edges || []).map((edge) => [edge.id, edge]),
  );

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.errorPolicy?.onError !== "fallback") {
      continue;
    }

    const fallbackEdgeId = node.errorPolicy.fallbackEdgeId;
    if (!fallbackEdgeId) {
      errors.push({
        path: `nodes.${nodeId}.errorPolicy.fallbackEdgeId`,
        message: `Node "${nodeId}" requires fallbackEdgeId when onError is "fallback"`,
        severity: "error",
      });
      continue;
    }

    const fallbackEdge = edgesById.get(fallbackEdgeId);
    if (!fallbackEdge) {
      errors.push({
        path: `nodes.${nodeId}.errorPolicy.fallbackEdgeId`,
        message: `Fallback edge "${fallbackEdgeId}" does not exist`,
        severity: "error",
      });
      continue;
    }

    if (fallbackEdge.type !== "error") {
      errors.push({
        path: `edges.${fallbackEdgeId}`,
        message: `Fallback edge "${fallbackEdgeId}" must have type "error"`,
        severity: "error",
      });
    }

    if (fallbackEdge.source !== nodeId) {
      errors.push({
        path: `edges.${fallbackEdgeId}.source`,
        message: `Fallback edge "${fallbackEdgeId}" must originate from node "${nodeId}"`,
        severity: "error",
      });
    }
  }
}

function validateActivityTypes(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
  options: ValidateGraphConfigOptions,
): void {
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type === "activity") {
      const activityNode = node as ActivityNode;
      if (!options.isRegisteredActivityType(activityNode.activityType)) {
        errors.push({
          path: `nodes.${nodeId}.activityType`,
          message: `Activity type "${activityNode.activityType}" is not registered`,
          severity: "error",
        });
      } else {
        options.validateActivityParameters(
          activityNode.activityType,
          nodeId,
          activityNode.parameters,
          errors,
        );
      }
    }

    if (node.type === "pollUntil") {
      const pollNode = node as PollUntilNode;
      if (!options.isRegisteredActivityType(pollNode.activityType)) {
        errors.push({
          path: `nodes.${nodeId}.activityType`,
          message: `Activity type "${pollNode.activityType}" is not registered`,
          severity: "error",
        });
      } else {
        options.validateActivityParameters(
          pollNode.activityType,
          nodeId,
          pollNode.parameters,
          errors,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// US-109: SourceNode structural validation
//
// Five rules:
//   1. SourceNode.inputs[] must be empty/absent — sources have no upstream.
//   2. `sourceType` must resolve against the source catalog.
//   3. `parameters` must satisfy the entry's `parametersSchema` (Zod).
//   4. Phase 8.0 supports at most one source per subtype — coexistence of
//      different subtypes (e.g. one `source.api` + one `source.upload`) is
//      allowed, but two of the same subtype is deferred to Phase 8.x.
//   5. SOFT WARNING (not error) when a `source.api` node coexists with one
//      or more `CtxDeclaration` entries flagged `isInput: true` — both
//      surfaces produce the run-spec input shape, and the source wins at
//      runtime so the `isInput` flags are ignored.
//
// See feature-docs/20260530-workflow-builder-phase8-document-sources/REQUIREMENTS.md
// §3.3 (L17, L16) and DOCUMENT_SOURCES_DESIGN.md §1.
// ---------------------------------------------------------------------------

function validateSourceNodes(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
  options: ValidateGraphConfigOptions,
): void {
  const lookupEntry =
    options.getSourceCatalogEntry ?? defaultGetSourceCatalogEntry;

  const sourceNodes: SourceNode[] = [];

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "source") continue;
    const sourceNode = node as SourceNode;
    sourceNodes.push(sourceNode);

    // Rule 1: source nodes cannot have upstream port bindings.
    if (sourceNode.inputs && sourceNode.inputs.length > 0) {
      errors.push({
        path: `nodes.${nodeId}.inputs`,
        message: `Source node \`${nodeId}\` cannot have inputs[]; sources have no upstream`,
        severity: "error",
      });
    }

    // Rule 2 + 3: sourceType resolves, then parameters pass the entry's Zod schema.
    const entry = lookupEntry(sourceNode.sourceType);
    if (!entry) {
      errors.push({
        path: `nodes.${nodeId}.sourceType`,
        message: `Source node \`${nodeId}\` references unknown source type \`${sourceNode.sourceType}\``,
        severity: "error",
      });
    } else {
      const parsed = entry.parametersSchema.safeParse(
        sourceNode.parameters ?? {},
      );
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const suffix =
            issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
          errors.push({
            path: `nodes.${nodeId}.parameters${suffix}`,
            message: issue.message,
            severity: "error",
          });
        }
      }
    }
  }

  // Rule 4: Phase 8.0 supports at most one source per subtype. Group source
  // nodes by `sourceType`; for any group with count > 1, emit one error per
  // duplicate (anchored to each duplicate beyond the first occurrence).
  const bySubtype = new Map<string, SourceNode[]>();
  for (const node of sourceNodes) {
    const existing = bySubtype.get(node.sourceType);
    if (existing) {
      existing.push(node);
    } else {
      bySubtype.set(node.sourceType, [node]);
    }
  }
  for (const [sourceType, group] of bySubtype.entries()) {
    if (group.length <= 1) continue;
    // Anchor each error to the duplicate (every node after the first
    // occurrence). Keeps the message attached to *a* source node so the
    // builder's per-node error surfacing can highlight it.
    for (let i = 1; i < group.length; i++) {
      const duplicate = group[i];
      errors.push({
        path: `nodes.${duplicate.id}.sourceType`,
        message: `Phase 8.0 supports at most one source of subtype \`${sourceType}\` per workflow — multi-${sourceType} is deferred to Phase 8.x`,
        severity: "error",
      });
    }
  }

  // Rule 5: source.api + isInput-flagged ctx → soft warning.
  const hasApiSource = sourceNodes.some(
    (node) => node.sourceType === "source.api",
  );
  if (hasApiSource && config.ctx) {
    const hasIsInputCtx = Object.values(config.ctx).some(
      (decl) => decl.isInput === true,
    );
    if (hasIsInputCtx) {
      errors.push({
        path: "metadata.ctx",
        message:
          "Workflow has a source.api node — isInput flags on ctx declarations are ignored. Remove isInput flags or remove the source.api to clarify intent.",
        severity: "warning",
      });
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
        const rootKey = getCtxRootKey(binding.ctxKey);
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
        const rootKey = getCtxRootKey(binding.ctxKey);
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
  const declaredCtxKeys = config.ctx
    ? new Set(Object.keys(config.ctx))
    : new Set<string>();

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

function validateDurations(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type === "pollUntil") {
      const pollNode = node as PollUntilNode;
      checkDuration(pollNode.interval, `nodes.${nodeId}.interval`, errors);
      checkDuration(
        pollNode.initialDelay,
        `nodes.${nodeId}.initialDelay`,
        errors,
      );
      checkDuration(pollNode.timeout, `nodes.${nodeId}.timeout`, errors);
    } else if (node.type === "humanGate") {
      const gateNode = node as HumanGateNode;
      checkDuration(gateNode.timeout, `nodes.${nodeId}.timeout`, errors);
    }
  }
}

function checkDuration(
  value: string | undefined,
  path: string,
  errors: GraphValidationError[],
): void {
  // Undefined optionals are skipped — only declared values get checked.
  if (value === undefined) return;
  if (!isValidTemporalDuration(value)) {
    errors.push({
      path,
      message: "Invalid Temporal duration",
      severity: "error",
    });
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
    const rootCtxKey = getRefCtxRootKey(ref.ref);
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
      if (
        mapNode.bodyEntryNodeId in config.nodes &&
        !visited.has(mapNode.bodyEntryNodeId)
      ) {
        markBodyNodesReachable(mapNode.bodyEntryNodeId, adjacency, visited, config);
      }
    }
  }
}

function validateNodeGroups(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (!config.nodeGroups) return;

  const nodeIds = new Set(Object.keys(config.nodes));
  const nodeToGroupMap = new Map<string, string[]>();

  for (const [groupId, group] of Object.entries(config.nodeGroups)) {
    if (!group.nodeIds || group.nodeIds.length === 0) {
      errors.push({
        path: `nodeGroups.${groupId}.nodeIds`,
        message: `Node group "${groupId}" must have at least one nodeId`,
        severity: "error",
      });
      continue;
    }

    for (let i = 0; i < group.nodeIds.length; i++) {
      const nodeId = group.nodeIds[i];
      if (!nodeIds.has(nodeId)) {
        errors.push({
          path: `nodeGroups.${groupId}.nodeIds[${i}]`,
          message: `Node group "${groupId}" references non-existent node: "${nodeId}"`,
          severity: "error",
        });
      }

      if (!nodeToGroupMap.has(nodeId)) {
        nodeToGroupMap.set(nodeId, []);
      }
      nodeToGroupMap.get(nodeId)!.push(groupId);
    }

    if (group.exposedParams) {
      for (let i = 0; i < group.exposedParams.length; i++) {
        const param = group.exposedParams[i];
        const paramPath = param.path;

        if (paramPath.startsWith("nodes.")) {
          const parts = paramPath.split(".");
          if (parts.length >= 2) {
            const referencedNodeId = parts[1];
            if (!nodeIds.has(referencedNodeId)) {
              errors.push({
                path: `nodeGroups.${groupId}.exposedParams[${i}].path`,
                message: `Exposed parameter path "${paramPath}" references non-existent node: "${referencedNodeId}"`,
                severity: "error",
              });
            }
          }
        }
      }
    }
  }

  for (const [nodeId, groupIds] of nodeToGroupMap.entries()) {
    if (groupIds.length > 1) {
      errors.push({
        path: `nodes.${nodeId}`,
        message: `Node "${nodeId}" appears in multiple groups: ${groupIds.join(", ")}`,
        severity: "warning",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// US-093: Binding-walk type-check pass
// ---------------------------------------------------------------------------

type PortDirection = "input" | "output";

interface BindingParticipant {
  node: GraphNode;
  port: string;
  ctxKey: string;
  kind: KindRef | undefined;
}

interface CtxKeyParticipants {
  producers: BindingParticipant[];
  consumers: BindingParticipant[];
}

/**
 * Resolve the typed-I/O `kind` for a port on a node in a given direction.
 *
 * Resolution order per REQUIREMENTS.md §4.2:
 *   1. Activity `PortDescriptor.kind?` (catalog lookup for activity / pollUntil nodes)
 *   2. `CtxDeclaration.kind?` (the ctx key the port binds to)
 *   3. `LibraryPortDescriptor.kind?` (library workflow's own entry-point ports)
 *   4. Undefined → callers treat as `Artifact` wildcard via `isAssignable`.
 *
 * Cross-workflow library port resolution (parent referencing a library via
 * `childWorkflow.workflowRef.type === "library"`) is intentionally out of
 * scope for this pass — those ports collapse to the `Artifact` wildcard.
 */
function resolvePortKind(
  node: GraphNode,
  portName: string,
  direction: PortDirection,
  ctxKey: string,
  config: GraphWorkflowConfig,
): KindRef | undefined {
  // 1. Activity / pollUntil catalog PortDescriptor.kind
  if (node.type === "activity") {
    const activityNode = node as ActivityNode;
    const entry = getActivityCatalogEntry(activityNode.activityType);
    if (entry) {
      const descriptors =
        direction === "input" ? entry.inputs : entry.outputs;
      const portDescriptor = descriptors.find((p) => p.name === portName);
      if (portDescriptor?.kind !== undefined) {
        return portDescriptor.kind;
      }
    }
  } else if (node.type === "pollUntil") {
    const pollNode = node as PollUntilNode;
    const entry = getActivityCatalogEntry(pollNode.activityType);
    if (entry) {
      const descriptors =
        direction === "input" ? entry.inputs : entry.outputs;
      const portDescriptor = descriptors.find((p) => p.name === portName);
      if (portDescriptor?.kind !== undefined) {
        return portDescriptor.kind;
      }
    }
  }

  // 2. CtxDeclaration.kind for the ctx key this port binds to
  const rootKey = getCtxRootKey(ctxKey);
  const ctxDecl = config.ctx?.[rootKey];
  if (ctxDecl?.kind !== undefined) {
    return ctxDecl.kind;
  }

  // 3. LibraryPortDescriptor.kind — only meaningful when validating a
  // library workflow's own entry-point signature. A library's declared
  // `metadata.inputs[]` describes ctx writers (producers); `metadata.outputs[]`
  // describes ctx readers (consumers). Match by `path` resolving to this ctx
  // key (both `"ctx.<key>"` and bare `"<key>"` shapes are accepted to mirror
  // the picker / runtime path resolution surface).
  if (config.metadata?.kind === "library") {
    const descriptors =
      direction === "output"
        ? config.metadata.inputs
        : config.metadata.outputs;
    // direction === "output" on a node means the node WRITES the ctx key,
    // which is itself READ from the library's declared INPUT surface (the
    // library's input feeds the graph). Symmetrically, an output port of
    // the library is READ by downstream callers and FED by node inputs
    // inside the library graph... but inside a library the typed surface
    // for ctx writers comes from `metadata.inputs[]`. We only consult
    // `metadata.inputs[]` here when no closer (catalog / CtxDeclaration)
    // kind was found and we're looking at the producer side; similarly
    // `metadata.outputs[]` for the consumer side.
    if (descriptors) {
      const match = descriptors.find(
        (descriptor) => libraryPortPathMatchesCtxKey(descriptor.path, ctxKey),
      );
      if (match?.kind !== undefined) {
        return match.kind;
      }
    }
  }

  return undefined;
}

/**
 * `LibraryPortDescriptor.path` may be written as `"ctx.<key>"` or the bare
 * `"<key>"`. Match either form against the ctx key the port binds to.
 */
function libraryPortPathMatchesCtxKey(path: string, ctxKey: string): boolean {
  if (path === ctxKey) return true;
  if (path === `ctx.${ctxKey}`) return true;
  // Compare on root keys too — the picker resolves `doc.X` / `segment.X`
  // through the same `getCtxRootKey` helper, so a path of `ctx.documentMetadata`
  // matches a port binding of `doc.something`.
  const pathRoot = path.startsWith("ctx.") ? path.slice(4).split(".")[0] : path.split(".")[0];
  const ctxRoot = getCtxRootKey(ctxKey);
  return pathRoot === ctxRoot;
}

/**
 * US-110: Enumerate the ctx producers a `SourceNode` contributes to the
 * binding-walk pass.
 *
 * Dispatches on `sourceType`:
 *   - `"source.api"`   — walks `parameters.fields[]`; each row contributes
 *     `(node, port: field.name, ctxKey: field.name, kind: field.kind ?? "Artifact")`.
 *     Per-field `kind?` annotations make the producer surface heterogeneous.
 *   - `"source.upload"` — single ctx key from `parameters.ctxKey ?? "documentUrl"`
 *     with the catalog entry's `outputKind` (i.e. `"Document"` for the
 *     Phase 8.0 upload subtype).
 *   - Anything else — no producers enumerated. Future Phase 8.x subtypes
 *     don't exist in the catalog yet, so reaching this branch implies
 *     the structural validator (US-109) would have already flagged the
 *     subtype before we got here.
 */
function enumerateSourceProducers(
  sourceNode: SourceNode,
  entry: SourceCatalogEntry,
  ensureEntry: (ctxKey: string) => CtxKeyParticipants,
): void {
  if (sourceNode.sourceType === "source.api") {
    const rawFields = (sourceNode.parameters as { fields?: unknown } | undefined)
      ?.fields;
    if (!Array.isArray(rawFields)) return;
    for (const raw of rawFields) {
      const field = raw as FieldDescriptor;
      if (!field || typeof field.name !== "string") continue;
      ensureEntry(field.name).producers.push({
        node: sourceNode,
        port: field.name,
        ctxKey: field.name,
        kind: field.kind ?? "Artifact",
      });
    }
    return;
  }

  if (sourceNode.sourceType === "source.upload") {
    const params = sourceNode.parameters as
      | { ctxKey?: unknown }
      | undefined;
    const ctxKey =
      typeof params?.ctxKey === "string" && params.ctxKey.length > 0
        ? params.ctxKey
        : "documentUrl";
    ensureEntry(ctxKey).producers.push({
      node: sourceNode,
      port: ctxKey,
      ctxKey,
      kind: entry.outputKind,
    });
    return;
  }
}

/**
 * Walk every node's `inputs[]` / `outputs[]` bindings and group them by ctx
 * key. For each ctx key that has both producers and consumers, verify that
 * every producer's kind is assignable to every consumer's kind. Mismatches
 * are anchored to the consumer port.
 *
 * US-110: Source nodes (`type === "source"`) are also enumerated as ctx
 * producers — they have no `outputs[]` bindings (they write directly to
 * ctx via their catalog entry's `deriveOutputSchema`), so their producer
 * records are synthesised from `parameters.fields[]` (for `source.api`)
 * or the configured `ctxKey` (for `source.upload`). The producer kind
 * comes from each `FieldDescriptor.kind?` (heterogeneous, source.api) or
 * the catalog entry's `outputKind` (single fixed kind, source.upload).
 *
 * Pure pass — no I/O, no side effects beyond pushing errors.
 */
function walkCtxKeyBindings(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
  options: ValidateGraphConfigOptions,
): void {
  const lookupSourceEntry =
    options.getSourceCatalogEntry ?? defaultGetSourceCatalogEntry;

  const byCtxKey = new Map<string, CtxKeyParticipants>();

  function ensureEntry(ctxKey: string): CtxKeyParticipants {
    let entry = byCtxKey.get(ctxKey);
    if (!entry) {
      entry = { producers: [], consumers: [] };
      byCtxKey.set(ctxKey, entry);
    }
    return entry;
  }

  for (const node of Object.values(config.nodes)) {
    if (node.inputs) {
      for (const binding of node.inputs) {
        const kind = resolvePortKind(
          node,
          binding.port,
          "input",
          binding.ctxKey,
          config,
        );
        ensureEntry(binding.ctxKey).consumers.push({
          node,
          port: binding.port,
          ctxKey: binding.ctxKey,
          kind,
        });
      }
    }
    if (node.outputs) {
      for (const binding of node.outputs) {
        const kind = resolvePortKind(
          node,
          binding.port,
          "output",
          binding.ctxKey,
          config,
        );
        ensureEntry(binding.ctxKey).producers.push({
          node,
          port: binding.port,
          ctxKey: binding.ctxKey,
          kind,
        });
      }
    }

    // US-110: source nodes contribute synthetic producer records derived
    // from their catalog entry / configured parameters. If the source
    // catalog entry is unknown the structural validator (US-109) has
    // already flagged it — skip enumeration here to avoid noise.
    if (node.type === "source") {
      const sourceNode = node as SourceNode;
      const entry = lookupSourceEntry(sourceNode.sourceType);
      if (!entry) continue;
      enumerateSourceProducers(sourceNode, entry, ensureEntry);
    }
  }

  for (const [ctxKey, { producers, consumers }] of byCtxKey.entries()) {
    if (producers.length === 0 || consumers.length === 0) continue;
    for (const consumer of consumers) {
      for (const producer of producers) {
        if (isAssignable(producer.kind, consumer.kind)) continue;
        const producerKindLabel = producer.kind ?? "Artifact";
        const consumerKindLabel = consumer.kind ?? "Artifact";
        errors.push({
          path: `nodes.${consumer.node.id}.inputs.${consumer.port}`,
          message: `Input port \`${consumer.port}\` (${consumerKindLabel}) on node \`${consumer.node.id}\` reads from ctx key \`${ctxKey}\`, written by node \`${producer.node.id}\` (${producerKindLabel}) — ${producerKindLabel} not assignable to ${consumerKindLabel}`,
          severity: "error",
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// US-094: Library `metadata.inputs[].path` / `metadata.outputs[].path`
//         depth-check pass
//
// For library workflows only, every declared `LibraryPortDescriptor.path`
// must resolve to a real referent in the graph:
//   - `"ctx.<key>"` or bare `"<key>"` → must match a declared `config.ctx`
//     entry (compared on the root ctx key, mirroring the picker / runtime
//     surface).
//   - `"nodes.<nodeId>.outputs.<port>"` → must match a node whose
//     `outputs[]` binds that port name.
//
// This pass is INDEPENDENT of US-093's kind-mismatch walk. A path may
// resolve cleanly here yet still fail kind-check there, and vice versa.
// ---------------------------------------------------------------------------

type LibraryPortDirection = "inputs" | "outputs";

/**
 * Determine whether `descriptor.path` resolves to either a declared ctx
 * key or an existing node's bound output port in the graph.
 */
function libraryPathResolves(
  path: string,
  config: GraphWorkflowConfig,
): boolean {
  // Shape A: explicit `nodes.<nodeId>.outputs.<port>` reference.
  if (path.startsWith("nodes.")) {
    const segments = path.split(".");
    // Expected shape: ["nodes", "<nodeId>", "outputs", "<port>", ...]
    if (segments.length >= 4 && segments[2] === "outputs") {
      const nodeId = segments[1];
      const portName = segments[3];
      const node = config.nodes?.[nodeId];
      if (!node) return false;
      if (!node.outputs) return false;
      return node.outputs.some((binding) => binding.port === portName);
    }
    return false;
  }

  // Shape B: `ctx.<key>` (with optional dotted sub-path) → resolve root.
  // Shape C: bare `<key>` (with optional dotted sub-path) → resolve root.
  const declaredCtxKeys = config.ctx ? Object.keys(config.ctx) : [];
  if (declaredCtxKeys.length === 0) return false;
  const declaredSet = new Set(declaredCtxKeys);

  const rootKey = path.startsWith("ctx.")
    ? path.slice(4).split(".")[0]
    : path.split(".")[0];

  if (!rootKey) return false;
  return declaredSet.has(rootKey);
}

/**
 * Walk `metadata.inputs[]` / `metadata.outputs[]` and emit an error for
 * every descriptor whose `path` doesn't resolve.
 *
 * No-op for non-library workflows and for library workflows with empty
 * `inputs[]` / `outputs[]`.
 */
function walkLibraryPaths(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (config.metadata?.kind !== "library") return;

  const checkDescriptors = (
    descriptors: LibraryPortDescriptor[] | undefined,
    direction: LibraryPortDirection,
  ): void => {
    if (!descriptors) return;
    const labelPrefix = direction === "inputs" ? "Library input" : "Library output";
    for (let i = 0; i < descriptors.length; i++) {
      const descriptor = descriptors[i];
      if (libraryPathResolves(descriptor.path, config)) continue;
      errors.push({
        path: `metadata.${direction}[${i}].path`,
        message: `${labelPrefix} \`${descriptor.label}\` path \`${descriptor.path}\` does not resolve to a declared ctx key or node output in this graph`,
        severity: "error",
      });
    }
  };

  checkDescriptors(config.metadata.inputs, "inputs");
  checkDescriptors(config.metadata.outputs, "outputs");
}
