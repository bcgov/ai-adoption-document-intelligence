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
 * See docs-md/workflows/DAG_WORKFLOW_ENGINE.md
 */

import { isAutoCtxKey, resolveCtxKeySource } from "../auto-wire";
import { getActivityCatalogEntry as defaultGetActivityCatalogEntry } from "../catalog";
import { getSourceCatalogEntry as defaultGetSourceCatalogEntry } from "../catalog/source-catalog";
import type {
  FieldDescriptor,
  SourceCatalogEntry,
} from "../catalog/source-types";
import type { ActivityCatalogEntry } from "../catalog/types";
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
 *
 * When omitted, activity type and parameter checks are skipped (useful for
 * frontend or tooling contexts that do not have a registry).
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
  getSourceCatalogEntry?: (
    sourceType: string,
  ) => SourceCatalogEntry | undefined;
  /**
   * Optional lookup for activity catalog entries. Defaults to the
   * imported `getActivityCatalogEntry` against the package-level
   * `ACTIVITY_CATALOG` (static catalog only).
   *
   * Phase 6 US-174: the backend wraps this to merge static catalog
   * lookups with the workflow's group dynamic-node lineages so the
   * binding-walk pass resolves `dyn.<slug>` port kinds the same way
   * it resolves static activity port kinds. When the lookup returns
   * `undefined`, the binding-walk leaves the port kind as
   * unresolved (`Artifact` wildcard) — which is the current behaviour
   * for static activities the static catalog doesn't know about.
   *
   * For `dyn.<slug>` lookups specifically, the backend wrapper also
   * accepts an `ActivityNode` so it can honour the node's
   * `dynamicNodeVersion?: number` pin (US-174 Scenario 4). The
   * lookup falls back to the head version when no pin is set; the
   * shared validator never needs to know which version was used.
   */
  getActivityCatalogEntry?: (
    activityType: string,
    node?: ActivityNode | PollUntilNode,
  ) => ActivityCatalogEntry | undefined;
}

const SKIP_ACTIVITY_VALIDATION: ValidateGraphConfigOptions = {
  isRegisteredActivityType: () => true,
  validateActivityParameters: () => undefined,
};

/**
 * Validate a graph workflow config.
 *
 * @param config - The graph workflow configuration to validate.
 * @param options - Activity registry callbacks; injected by each app. When
 *   omitted, activity type and parameter checks are skipped.
 * @returns Validation result with an errors array.
 */
export function validateGraphConfig(
  config: GraphWorkflowConfig,
  options: ValidateGraphConfigOptions = SKIP_ACTIVITY_VALIDATION,
): { valid: boolean; errors: GraphValidationError[] } {
  return validateConfig(config, options, new Set());
}

/**
 * The real entry point. `visited` carries the set of config objects already
 * being validated on the current descent so a `childWorkflow` whose inline
 * graph (transitively) embeds itself terminates instead of recursing forever
 * — a hand-authored/API config can hold such a reference in memory.
 */
function validateConfig(
  config: GraphWorkflowConfig,
  options: ValidateGraphConfigOptions,
  visited: Set<GraphWorkflowConfig>,
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
  validateHumanGateNodes(config, errors);
  validateMapJoinNodes(config, errors);
  validateMapItemKeyCollisions(config, errors);
  validateJoinScope(config, errors);
  validatePortBindings(config, errors);
  validateExpressions(config, errors);
  validateDurations(config, errors);
  validateDagStructure(config, errors);
  validateReachability(config, errors);
  validateNodeGroups(config, errors);
  validateDynamicNodeReferences(config, errors, options);
  walkCtxKeyBindings(config, errors, options);
  walkLibraryPaths(config, errors);
  validateReservedCtxNamespaces(config, errors);
  validateInlineChildGraphs(config, errors, options, visited);

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
    if (typeof node.label !== "string" || node.label.trim() === "") {
      errors.push({
        path: `nodes.${nodeId}.label`,
        message: `Node "${nodeId}" must have a non-empty label`,
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

/**
 * A `humanGate` blocks until a signal naming that gate arrives. The signal
 * name is the only handle anything — the built-in HITL review flow or an
 * external caller — has to resume the gate, so an empty name produces a gate
 * that can never be opened and a workflow that can only ever time out.
 * Free-typed names stay legal; only the missing/blank case is rejected.
 */
function validateHumanGateNodes(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const mapBodyNodeIds = collectMapBodyNodeIds(config);
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "humanGate") continue;
    const gateNode = node as HumanGateNode;

    const signalName = gateNode.signal?.name;
    if (typeof signalName !== "string" || signalName.trim() === "") {
      errors.push({
        path: `nodes.${nodeId}.signal.name`,
        message: `Human gate "${gateNode.label || nodeId}" has no signal name, so nothing can ever resume it.`,
        severity: "error",
      });
    }

    // G-070 — a gate inside a map body cannot work, and failed silently.
    //
    // `executeHumanGateNode` calls `setHandler(defineSignal(node.signal.name))`
    // every time it runs, and a map body runs once per item — so N iterations
    // register N handlers under ONE name and the last registration wins.
    // Resuming is worse: the backend signals the workflow by id with the fixed
    // name "humanApproval", so there is no per-iteration address to send to
    // even if the handlers were distinct. One approval, N waiting branches.
    //
    // Refused rather than worked around: per-iteration signal routing is a
    // feature, not a fix, and the runtime cannot honour this shape today.
    if (mapBodyNodeIds.has(nodeId)) {
      errors.push({
        path: `nodes.${nodeId}`,
        message: `Human gate "${gateNode.label || nodeId}" is inside a loop body. Each item would register the same signal name, and an approval has no way to say which item it is for — move the gate outside the loop.`,
        severity: "error",
      });
    }
  }
}

/**
 * Every node reachable from some map's `bodyEntryNodeId` without passing its
 * `bodyExitNodeId` — i.e. the nodes that execute once per item.
 *
 * Deliberately a local walk rather than a reuse of `markBodyNodesReachable`:
 * that one exists to suppress unreachable-node warnings and marks the exit's
 * successors too, which is the wrong population for "runs per iteration".
 */
function collectMapBodyNodeIds(config: GraphWorkflowConfig): Set<string> {
  return new Set(collectMapBodyMembership(config).keys());
}

/**
 * Which map bodies each node belongs to — `nodeId → set of map ids`.
 *
 * A node can belong to more than one when maps nest. The membership (not just
 * "is in some body") is what makes the join-scope rule expressible: a join can
 * only read a map's results if it sits in the same iteration scope.
 */
export function collectMapBodyMembership(
  config: GraphWorkflowConfig,
): Map<string, Set<string>> {
  const adjacency = new Map<string, string[]>();
  for (const edge of config.edges ?? []) {
    const list = adjacency.get(edge.source);
    if (list) list.push(edge.target);
    else adjacency.set(edge.source, [edge.target]);
  }

  const membership = new Map<string, Set<string>>();
  for (const node of Object.values(config.nodes ?? {})) {
    if (node.type !== "map") continue;
    const mapNode = node as MapNode;
    const queue: string[] = [mapNode.bodyEntryNodeId];
    const seen = new Set<string>(queue);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || !(current in (config.nodes ?? {}))) continue;
      const owners = membership.get(current);
      if (owners) owners.add(node.id);
      else membership.set(current, new Set([node.id]));
      // The exit node is the body's last step — do not walk past it, or every
      // node downstream of the map would count as per-iteration.
      if (current === mapNode.bodyExitNodeId) continue;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return membership;
}

/**
 * G-036 — the maps a join at `joinNodeId` could legally collect from.
 *
 * The picker and `validateJoinScope` MUST agree, or the editor offers a
 * choice that Save then refuses. Both read this, so they cannot drift.
 *
 * `joinNodeId` may name a node that does not exist yet (a fresh join being
 * configured); it simply has no body membership, which is the correct answer
 * for a node at the top level.
 */
export function joinableMapIds(
  config: GraphWorkflowConfig,
  joinNodeId: string,
): Set<string> {
  const membership = collectMapBodyMembership(config);
  const joinBodies = membership.get(joinNodeId) ?? new Set<string>();
  const allowed = new Set<string>();
  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    if (node.type !== "map") continue;
    // A join inside its own source's body would run before the map finished.
    if (joinBodies.has(nodeId)) continue;
    const sourceBodies = membership.get(nodeId) ?? new Set<string>();
    const outOfScope = [...sourceBodies].some((id) => !joinBodies.has(id));
    if (outOfScope) continue;
    allowed.add(nodeId);
  }
  return allowed;
}

/**
 * G-036 — a join can only read results a map actually handed it.
 *
 * `executeBranchSubgraph` allocates `mapBranchResults: new Map()` per
 * ITERATION, so an inner map's results are discarded when its iteration ends.
 * A join sitting outside that iteration scope therefore throws
 * `No results found for map node <id>` at run time. Nothing rejected the shape
 * statically, and the picker offered it with no dimming — `filterType="map"`
 * was its only filter — so it was easy to build and impossible to foresee.
 *
 * Two shapes are refused:
 *   - the source map runs inside a body the join is NOT inside (its results
 *     die with the iteration);
 *   - the join sits inside its own source map's body (the map has not
 *     finished collecting when the join runs).
 */
function validateJoinScope(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const membership = collectMapBodyMembership(config);
  const bodiesOf = (nodeId: string): Set<string> =>
    membership.get(nodeId) ?? new Set<string>();

  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    if (node.type !== "join") continue;
    const joinNode = node as JoinNode;
    const sourceId = joinNode.sourceMapNodeId;
    const sourceNode = config.nodes[sourceId];
    // Existence and type are already reported by `validateMapJoinNodes`;
    // repeating them here would double-report the same anchor.
    if (!sourceNode || sourceNode.type !== "map") continue;

    const joinBodies = bodiesOf(nodeId);
    const label = joinNode.label || nodeId;

    if (joinBodies.has(sourceId)) {
      errors.push({
        path: `nodes.${nodeId}.sourceMapNodeId`,
        message: `Join "${label}" is inside the body of the loop it collects from, so the loop has not finished when it runs — move it after the loop.`,
        severity: "error",
      });
      continue;
    }

    const unreachableScopes = [...bodiesOf(sourceId)].filter(
      (mapId) => !joinBodies.has(mapId),
    );
    if (unreachableScopes.length > 0) {
      const outer = config.nodes[unreachableScopes[0]];
      const outerLabel = outer?.label || unreachableScopes[0];
      errors.push({
        path: `nodes.${nodeId}.sourceMapNodeId`,
        message: `Join "${label}" collects from a loop that runs inside "${outerLabel}", whose results are discarded when each item finishes — put the join inside "${outerLabel}" too, or collect from "${outerLabel}" instead.`,
        severity: "error",
      });
    }
  }
}

/**
 * G-037 — the palette's control-flow skeletons ship these four fields as `""`.
 *
 * Every OTHER required field in the same objects has an existence check
 * (`bodyEntryNodeId`, `bodyExitNodeId`, `sourceMapNodeId`, `defaultEdge`,
 * `pollUntil.activityType`), and `computeNodeInputIssues` short-circuits for
 * every non-activity node — so a map, join or childWorkflow dropped from the
 * palette and left unconfigured carried no badge, no drawer row and no Save
 * objection. It looked exactly as healthy as a finished one, and failed at
 * execution.
 *
 * These are ERRORS, not warnings: unlike an absent `maxConcurrency` (a legal
 * configuration), an empty collection key cannot run under any circumstances.
 */
function requireNonEmpty(
  value: unknown,
  path: string,
  message: string,
  errors: GraphValidationError[],
): void {
  if (typeof value === "string" && value.trim() !== "") return;
  errors.push({ path, message, severity: "error" });
}

function validateMapJoinNodes(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const nodeIds = new Set(Object.keys(config.nodes));

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type === "map") {
      const mapNode = node as MapNode;
      const label = mapNode.label || nodeId;

      requireNonEmpty(
        mapNode.collectionCtxKey,
        `nodes.${nodeId}.collectionCtxKey`,
        `Map node "${label}" has no collection to loop over — pick the variable holding the list.`,
        errors,
      );
      requireNonEmpty(
        mapNode.itemCtxKey,
        `nodes.${nodeId}.itemCtxKey`,
        `Map node "${label}" has no item variable, so its body cannot read the current item — name one.`,
        errors,
      );

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

      // G-067 / G-077 — an absent `maxConcurrency` is not "some sensible
      // default", it is UNBOUNDED: a map over 200 segments starts 200
      // activities at once, swamping the worker and the upstream API. A
      // warning, not an error: unbounded is a legal configuration and may be
      // deliberate for a small, known collection, so it must never block Save.
      if (
        mapNode.maxConcurrency === undefined ||
        mapNode.maxConcurrency === null
      ) {
        errors.push({
          path: `nodes.${nodeId}.maxConcurrency`,
          message: `Map node "${mapNode.label || nodeId}" has no concurrency limit, so every item starts at once. Set one if the collection can be large.`,
          severity: "warning",
        });
      }
    }

    if (node.type === "join") {
      const joinNode = node as JoinNode;

      requireNonEmpty(
        joinNode.resultsCtxKey,
        `nodes.${nodeId}.resultsCtxKey`,
        `Join node "${joinNode.label || nodeId}" has nowhere to put the collected results — name a variable.`,
        errors,
      );

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

/**
 * D24 — two map nodes writing the SAME item variable.
 *
 * The palette now creates a map with `itemCtxKey: "currentSegment"` already
 * filled in, because an empty required field made every freshly dropped loop a
 * validation error and because `currentSegment` is the only name the
 * `segment.<field>` condition shorthand reads. The cost of that default is
 * this: drop a second loop and it starts life sharing the first one's key.
 *
 * What actually goes wrong, in order of how badly:
 *
 *  - **Nested maps** — an inner map's branch ctx is a copy of the outer's
 *    (`node-executors.ts` `executeMapNode`), so an inner loop reusing the key
 *    OVERWRITES the outer item for every step in its body. That is silent data
 *    loss at runtime.
 *  - **Sibling maps** — no runtime clash (each iteration gets its own branch
 *    ctx), but the key now has two writers in `collectCtxWriters`, so an
 *    auto-wired downstream port and the Ref picker have two equally good
 *    producers to choose between and resolve by node order.
 *
 * A WARNING, not an error, on purpose. Sharing the key is legal and often
 * inconsequential — two independent sibling loops whose bodies each read their
 * own item and nothing outside either body reads the key. Making it an error
 * would block Save on a graph that runs correctly, and would make the new
 * default worse than the empty field it replaced. The author needs to SEE it,
 * not be stopped by it.
 *
 * Anchored on the SECOND and later map in node-record order, so the first
 * definition keeps a clean node and the warning lands on the one the author
 * just added.
 */
function validateMapItemKeyCollisions(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const firstOwnerByKey = new Map<string, string>();

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "map") continue;
    const mapNode = node as MapNode;
    const key = mapNode.itemCtxKey?.trim();
    // An empty key is already a hard error from `validateMapJoinNodes`; two
    // empty ones are not a collision, they are the same error twice.
    if (!key) continue;

    const name = mapNode.label || nodeId;
    const owner = firstOwnerByKey.get(key);
    if (owner === undefined) {
      firstOwnerByKey.set(key, name);
      continue;
    }

    // Naming the incumbent by label is only worth doing when the labels
    // DIFFER. Both maps arrive from the palette called "Run for each item", so
    // the obvious phrasing renders as `Map node "Run for each item" reuses …
    // which "Run for each item" already writes` — which identifies nothing.
    // The row is click-to-select in the drawer, so the author reaches the
    // offending node from the row regardless; the label only ever adds colour.
    const incumbent =
      owner === name ? "another loop on this canvas" : `map node "${owner}"`;

    errors.push({
      path: `nodes.${nodeId}.itemCtxKey`,
      message: `Map node "${name}" reuses the item variable "${key}", which ${incumbent} already writes. Steps that read "${key}" can bind to the wrong loop, and if one of these loops runs inside the other the inner item replaces the outer one. Give this loop its own item variable unless both loops really mean the same item.`,
      severity: "warning",
    });
  }
}

/**
 * §3.6: Source nodes have no `outputs[]` bindings and are never mirrored into
 * `config.ctx`, but they DO produce ctx keys (`walkCtxKeyBindings` +
 * `enumerateSourceProducers` treat them as valid producers). Collect those
 * keys so the port-binding / expression validators don't reject a downstream
 * consumer of a source-produced key as "undeclared". Mirrors the key
 * derivation in `enumerateSourceProducers` (kinds aren't needed here).
 */
function collectSourceProducedCtxKeys(
  config: GraphWorkflowConfig,
): Set<string> {
  const keys = new Set<string>();
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "source") continue;
    const sourceNode = node as SourceNode;
    if (sourceNode.sourceType === "source.api") {
      const rawFields = (
        sourceNode.parameters as { fields?: unknown } | undefined
      )?.fields;
      if (Array.isArray(rawFields)) {
        for (const raw of rawFields) {
          const field = raw as FieldDescriptor;
          if (field && typeof field.name === "string") {
            keys.add(field.name);
          }
        }
      }
    } else if (sourceNode.sourceType === "source.upload") {
      const params = sourceNode.parameters as { ctxKey?: unknown } | undefined;
      const ctxKey =
        typeof params?.ctxKey === "string" && params.ctxKey.length > 0
          ? params.ctxKey
          : "documentUrl";
      keys.add(ctxKey);
    }
  }
  return keys;
}

function validatePortBindings(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  if (!config.ctx) return;

  const declaredCtxKeys = new Set(Object.keys(config.ctx));
  for (const key of collectSourceProducedCtxKeys(config)) {
    declaredCtxKeys.add(key);
  }

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.inputs) {
      for (let i = 0; i < node.inputs.length; i++) {
        const binding = node.inputs[i];
        // Auto-synthesised keys are resolver-internal — they are produced by
        // the resolver and consumed only by the resolver / engine; they never
        // need a `config.ctx` row.
        if (isAutoCtxKey(binding.ctxKey)) continue;
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
        // Auto-synthesised keys are resolver-internal — skip ctx declaration check.
        if (isAutoCtxKey(binding.ctxKey)) continue;
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
  // §3.6: source-produced keys are valid producers too (see
  // collectSourceProducedCtxKeys) — a switch/pollUntil condition may
  // reference one, so don't flag it as undeclared.
  for (const key of collectSourceProducedCtxKeys(config)) {
    declaredCtxKeys.add(key);
  }

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
    const compExpr = expr as { left?: ValueRef; right?: ValueRef };
    validateRequiredValueRef(
      compExpr.left,
      `${path}.left`,
      declaredCtxKeys,
      errors,
    );
    validateRequiredValueRef(
      compExpr.right,
      `${path}.right`,
      declaredCtxKeys,
      errors,
    );
  }

  if (VALID_LOGICAL_OPERATORS.includes(expr.operator)) {
    const logExpr = expr as { operands?: ConditionExpression[] };
    if (!Array.isArray(logExpr.operands) || logExpr.operands.length === 0) {
      errors.push({
        path: `${path}.operands`,
        message: `"${expr.operator}" requires a non-empty "operands" array`,
        severity: "error",
      });
    } else {
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
    const notExpr = expr as { operand?: ConditionExpression };
    if (notExpr.operand === undefined || notExpr.operand === null) {
      errors.push({
        path: `${path}.operand`,
        message: `"not" requires an "operand" expression`,
        severity: "error",
      });
    } else {
      validateExpression(
        notExpr.operand,
        `${path}.operand`,
        declaredCtxKeys,
        errors,
      );
    }
  }

  if (VALID_NULL_CHECK_OPERATORS.includes(expr.operator)) {
    const nullExpr = expr as { value?: ValueRef };
    validateRequiredValueRef(
      nullExpr.value,
      `${path}.value`,
      declaredCtxKeys,
      errors,
    );
  }

  if (VALID_LIST_MEMBERSHIP_OPERATORS.includes(expr.operator)) {
    const listExpr = expr as { value?: ValueRef; list?: ValueRef };
    validateRequiredValueRef(
      listExpr.value,
      `${path}.value`,
      declaredCtxKeys,
      errors,
    );
    validateRequiredValueRef(
      listExpr.list,
      `${path}.list`,
      declaredCtxKeys,
      errors,
    );
  }
}

/**
 * Validate a value ref that is structurally required by its parent operator.
 * Unlike `validateValueRef` (which silently ignores a missing / non-object
 * ref), this emits an error when the ref is absent or is neither a `{ ref }`
 * nor a `{ literal }`. Closes the gap where a comparison / null-check / list
 * operator with a missing operand passed validation and only failed at run
 * time.
 */
function validateRequiredValueRef(
  ref: ValueRef | undefined,
  path: string,
  declaredCtxKeys: Set<string>,
  errors: GraphValidationError[],
): void {
  if (ref === undefined || ref === null || typeof ref !== "object") {
    errors.push({
      path,
      message: "Expected a value ref (`{ ref }` or `{ literal }`)",
      severity: "error",
    });
    return;
  }
  const hasStringRef =
    "ref" in ref && typeof (ref as { ref?: unknown }).ref === "string";
  const hasLiteral = "literal" in ref;
  if (!hasStringRef && !hasLiteral) {
    errors.push({
      path,
      message: "Value ref must have either `ref` (string) or `literal`",
      severity: "error",
    });
    return;
  }
  validateValueRef(ref, path, declaredCtxKeys, errors);
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
          markBodyNodesReachable(
            mapNode.bodyEntryNodeId,
            adjacency,
            visited,
            config,
          );
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
        markBodyNodesReachable(
          mapNode.bodyEntryNodeId,
          adjacency,
          visited,
          config,
        );
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
// US-174: Dynamic-node reference resolution check
//
// Any node whose `activityType` starts with `dyn.` MUST resolve through
// the injected `getActivityCatalogEntry` lookup. The backend wrapper
// pre-loads the calling group's non-deleted dynamic-node lineages and
// any version-pinned older snapshots before invoking the validator.
// Failing to resolve a `dyn.<slug>` reference therefore means one of:
//   - the lineage was soft-deleted (most common case after a publish/
//     delete round-trip), or
//   - the lineage never existed in this group (a workflow imported
//     across groups, or a typo in the slug).
//
// Either way, the workflow can't run as-is. Surface the standard error
// wording the design doc locks in (§7.2): `"Workflow references deleted
// dynamic node 'dyn.<slug>'"`.
// ---------------------------------------------------------------------------

function validateDynamicNodeReferences(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
  options: ValidateGraphConfigOptions,
): void {
  // No injected catalog → no group context → static-only validation
  // surface (tests + non-group call paths). Skip the check.
  if (options.getActivityCatalogEntry === undefined) return;
  const lookup = options.getActivityCatalogEntry;

  for (const [nodeId, node] of Object.entries(config.nodes)) {
    let activityType: string | undefined;
    let nodeForLookup: ActivityNode | PollUntilNode | undefined;
    if (node.type === "activity") {
      const activityNode = node as ActivityNode;
      activityType = activityNode.activityType;
      nodeForLookup = activityNode;
    } else if (node.type === "pollUntil") {
      const pollNode = node as PollUntilNode;
      activityType = pollNode.activityType;
      nodeForLookup = pollNode;
    }
    if (activityType === undefined) continue;
    if (!activityType.startsWith("dyn.")) continue;
    if (lookup(activityType, nodeForLookup) !== undefined) continue;

    errors.push({
      path: `nodes.${nodeId}.activityType`,
      message: `Workflow references deleted dynamic node '${activityType}'`,
      severity: "error",
    });
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
  lookupActivityEntry: (
    activityType: string,
    node?: ActivityNode | PollUntilNode,
  ) => ActivityCatalogEntry | undefined,
): KindRef | undefined {
  // 1. Activity / pollUntil catalog PortDescriptor.kind
  if (node.type === "activity") {
    const activityNode = node as ActivityNode;
    const entry = lookupActivityEntry(activityNode.activityType, activityNode);
    if (entry) {
      const descriptors = direction === "input" ? entry.inputs : entry.outputs;
      const portDescriptor = descriptors.find((p) => p.name === portName);
      if (portDescriptor?.kind !== undefined) {
        return portDescriptor.kind;
      }
    }
  } else if (node.type === "pollUntil") {
    const pollNode = node as PollUntilNode;
    const entry = lookupActivityEntry(pollNode.activityType, pollNode);
    if (entry) {
      const descriptors = direction === "input" ? entry.inputs : entry.outputs;
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
      direction === "output" ? config.metadata.inputs : config.metadata.outputs;
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
      const match = descriptors.find((descriptor) =>
        libraryPortPathMatchesCtxKey(descriptor.path, ctxKey),
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
  const pathRoot = path.startsWith("ctx.")
    ? path.slice(4).split(".")[0]
    : path.split(".")[0];
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
    const rawFields = (
      sourceNode.parameters as { fields?: unknown } | undefined
    )?.fields;
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
    const params = sourceNode.parameters as { ctxKey?: unknown } | undefined;
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
  const lookupActivityEntry =
    options.getActivityCatalogEntry ??
    ((activityType: string) => defaultGetActivityCatalogEntry(activityType));

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
          lookupActivityEntry,
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
          lookupActivityEntry,
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
    if (consumers.length === 0) continue;
    if (producers.length === 0) {
      // G-002: nothing here to KIND-check — but a key with consumers and no
      // producer is not automatically fine either. `resolveCtxKeySource` is
      // the shared arbiter: it knows about the writes this walk never
      // enumerates (map item/index, join results, childWorkflow output
      // mappings, the humanGate payload key, live `__auto.<node>.<port>`
      // producers) and it treats a `config.ctx` declaration as a legitimate
      // source, so workflow inputs stay clean. Only when it finds nothing at
      // all is the binding genuinely dangling.
      for (const consumer of consumers) {
        if (resolveCtxKeySource(config, ctxKey) !== null) break;
        errors.push({
          path: `nodes.${consumer.node.id}.inputs.${consumer.port}`,
          message: `Input port \`${consumer.port}\` on node \`${consumer.node.id}\` reads from ctx key \`${ctxKey}\`, which nothing writes and no ctx declaration provides`,
          severity: "error",
        });
      }
      continue;
    }
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

/**
 * The runtime expression evaluator (`apps/temporal/src/expression-evaluator.ts`)
 * reserves the first dotted segment of a bare reference as a namespace:
 * `param.*` / `row.*` (table-lookup contexts), `ctx.*` (explicit ctx), and the
 * `doc.*` → `ctx.documentMetadata.*` / `segment.*` → `ctx.currentSegment.*`
 * shortcuts. A ctx key that is EXACTLY one of these words therefore cannot be
 * addressed as a plain ctx entry: a bare ref `segment` resolves to
 * `ctx.currentSegment` (not `ctx["segment"]`), and drilling it (`segment.type`)
 * silently reads a different object. So a producer/map/declaration that writes
 * such a key is unreachable by conditions — flag it. (Namespaced *paths* like
 * `doc.field` are the intended remap and are NOT flagged; only the bare word.)
 */
const RESERVED_CTX_NAMESPACES = new Set([
  "param",
  "row",
  "ctx",
  "doc",
  "segment",
]);

function validateReservedCtxNamespaces(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
): void {
  const flag = (ctxKey: string, path: string, what: string): void => {
    if (!RESERVED_CTX_NAMESPACES.has(ctxKey)) return;
    errors.push({
      path,
      message: `${what} \`${ctxKey}\` collides with a reserved expression namespace — a condition ref \`${ctxKey}\` resolves to \`${ctxKey === "doc" ? "ctx.documentMetadata" : ctxKey === "segment" ? "ctx.currentSegment" : ctxKey}\`, not this value. Rename it (e.g. \`${ctxKey}Value\`).`,
      severity: "error",
    });
  };

  for (const key of Object.keys(config.ctx ?? {})) {
    flag(key, `ctx.${key}`, "Ctx declaration key");
  }

  for (const node of Object.values(config.nodes)) {
    for (const binding of node.outputs ?? []) {
      flag(
        binding.ctxKey,
        `nodes.${node.id}.outputs.${binding.port}`,
        "Output binding ctx key",
      );
    }
    if (node.type === "map") {
      const mapNode = node as MapNode;
      flag(
        mapNode.itemCtxKey,
        `nodes.${node.id}.itemCtxKey`,
        "Map item ctx key",
      );
      if (mapNode.indexCtxKey !== undefined) {
        flag(
          mapNode.indexCtxKey,
          `nodes.${node.id}.indexCtxKey`,
          "Map index ctx key",
        );
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
    const labelPrefix =
      direction === "inputs" ? "Library input" : "Library output";
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

// ---------------------------------------------------------------------------
// Inline child graphs (G-015)
// ---------------------------------------------------------------------------

/**
 * `childWorkflow.workflowRef.type === "inline"` embeds a COMPLETE
 * `GraphWorkflowConfig`. Until G-015 no pass descended into it, so every rule
 * this validator enforces — edge refs, map/join cross-references, ctx
 * declarations, reserved namespaces, kind assignability, reachability —
 * stopped at the parent graph's boundary. An inline graph with a dangling
 * `entryNodeId` and a switch pointing at a missing edge validated green and
 * saved clean.
 *
 * The inner graph is validated with the SAME rules and the SAME injected
 * options (so activity-type and parameter checks apply one level down too),
 * and every inner error is re-anchored as
 * `nodes.<parentId>.inline.<inner path>`.
 *
 * That anchor shape is load-bearing on three surfaces:
 *   - `useGraphValidation`'s `nodeIdFromPath` takes the first segment after
 *     `nodes.`, so the issue buckets onto the PARENT node — the only node
 *     the canvas can draw a badge on, since the inner graph has no canvas.
 *   - `resolveAnchorTarget` resolves it to `{ kind: "node", nodeId: parent }`
 *     for the same reason, so clicking the row selects and reveals the
 *     childWorkflow node whose JSON editor holds the offending graph.
 *   - the inner node id survives inside the path, so the message still names
 *     exactly which node inside the JSON is wrong.
 *
 * Messages are prefixed with "Inline child graph:" so a reader of the drawer
 * can tell an inner problem from an outer one at a glance.
 */
function validateInlineChildGraphs(
  config: GraphWorkflowConfig,
  errors: GraphValidationError[],
  options: ValidateGraphConfigOptions,
  visited: Set<GraphWorkflowConfig>,
): void {
  visited.add(config);

  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    if (!node || node.type !== "childWorkflow") continue;
    const ref = node.workflowRef;

    // G-037 — the palette ships `workflowRef: { type: "library", workflowId: "" }`.
    // The inline branch below validates its graph thoroughly; the library
    // branch had no check at all, so an unconfigured childWorkflow saved clean.
    if (ref?.type === "library") {
      requireNonEmpty(
        ref.workflowId,
        `nodes.${nodeId}.workflowRef.workflowId`,
        `Sub-workflow node "${node.label || nodeId}" has no workflow selected — pick one from the library.`,
        errors,
      );
    }

    if (!ref || ref.type !== "inline") continue;

    const anchor = `nodes.${nodeId}.inline`;
    const inner = ref.graph;

    if (!inner || typeof inner !== "object") {
      errors.push({
        path: anchor,
        message:
          "Inline child graph: `workflowRef.graph` must be a graph workflow config object",
        severity: "error",
      });
      continue;
    }

    if (visited.has(inner)) {
      errors.push({
        path: anchor,
        message:
          "Inline child graph: recursive reference — this graph is already validated higher up the nesting chain",
        severity: "error",
      });
      continue;
    }

    const innerResult = validateConfig(inner, options, visited);
    for (const innerError of innerResult.errors) {
      errors.push({
        ...innerError,
        path: innerError.path === "" ? anchor : `${anchor}.${innerError.path}`,
        message: `Inline child graph: ${innerError.message}`,
      });
    }
  }
}
