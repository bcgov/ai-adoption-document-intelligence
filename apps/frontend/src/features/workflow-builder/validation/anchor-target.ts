/**
 * G-010 — resolve a validation issue's `path` into the concrete thing on the
 * canvas it is talking about, so clicking the issue can take you there.
 *
 * The validator (and the two frontend passes folded into the same list) emit
 * a fixed vocabulary of anchor shapes. Historically only
 * `nodes.<id>.inputs.<port>` was understood; every other shape degraded to
 * "workflow-level" and rendered as a non-actionable row, even when it named a
 * specific node, edge, group or ctx key.
 *
 * Emitters covered:
 *   - `packages/graph-workflow/src/validator/validator.ts`
 *   - `../auto-wire-validation.ts`
 *   - `./map-body-validation.ts`
 *
 * `null` means the anchor genuinely has no single target — the four cases are
 * `""` (whole config), `schemaVersion`, `nodes` (the map is empty / not an
 * object) and `edges` (a cycle spans the graph, not one edge).
 */

import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";

/**
 * Where a validation issue points. Discriminated so the editor page can
 * dispatch each kind to its own reveal behaviour without re-parsing paths.
 */
export type AnchorTarget =
  /** Select the node and bring it into view. */
  | { kind: "node"; nodeId: string }
  /** Select the node AND open that input's source picker. */
  | { kind: "nodeInput"; nodeId: string; port: string }
  /** Select the connection and bring both its endpoints into view. */
  | { kind: "edge"; edgeId: string }
  /** Open the group in the right rail and bring its members into view. */
  | { kind: "group"; groupId: string }
  /** Open the workflow-settings drawer, where the offending field lives. */
  | {
      kind: "workflowSettings";
      focus: "ctx" | "entryNode" | "libraryPorts";
    };

/**
 * Split `nodes.<...>` into the node id and the remainder.
 *
 * Node ids are config keys and may in principle contain dots, so prefer the
 * longest declared key that prefixes the path at a segment boundary. Falls
 * back to the first segment when no declared key matches — a dangling
 * reference still names the node the author was thinking of, and the drawer
 * buckets it the same way (`useGraphValidation`'s `nodeIdFromPath`).
 */
function splitNodeId(
  rest: string,
  config: GraphWorkflowConfig,
): { nodeId: string; remainder: string } {
  let best: string | null = null;
  for (const key of Object.keys(config.nodes ?? {})) {
    if (
      rest === key ||
      rest.startsWith(`${key}.`) ||
      rest.startsWith(`${key}[`)
    ) {
      if (best === null || key.length > best.length) best = key;
    }
  }
  const nodeId = best ?? rest.split(".")[0] ?? rest;
  return { nodeId, remainder: rest.slice(nodeId.length) };
}

/** `nodes.<id>.outputs.<port>` used as a library-port descriptor value. */
function nodeFromDescriptorPath(
  descriptorPath: string,
  config: GraphWorkflowConfig,
): AnchorTarget | null {
  if (!descriptorPath.startsWith("nodes.")) return null;
  const { nodeId } = splitNodeId(descriptorPath.slice("nodes.".length), config);
  if (!config.nodes?.[nodeId]) return null;
  return { kind: "node", nodeId };
}

const EDGE_INDEX_RE = /^edges\[(\d+)\](?:\.(?:source|target))?$/;
const EDGE_ID_RE = /^edges\.([^.]+)(?:\.source)?$/;
const GROUP_RE = /^nodeGroups\.([^.[]+)(?:[.[].*)?$/;
const LIBRARY_PORT_RE = /^metadata\.(inputs|outputs)\[(\d+)\]\.path$/;

/**
 * Resolve a validation error `path` to the thing it names, or `null` when the
 * anchor is genuinely workflow-level.
 */
export function resolveAnchorTarget(
  path: string,
  config: GraphWorkflowConfig,
): AnchorTarget | null {
  if (!path) return null;

  // --- node-anchored ------------------------------------------------------
  if (path.startsWith("nodes.")) {
    const { nodeId, remainder } = splitNodeId(
      path.slice("nodes.".length),
      config,
    );
    const inputPort = /^\.inputs\.([^.]+)$/.exec(remainder);
    if (inputPort) {
      return { kind: "nodeInput", nodeId, port: inputPort[1] };
    }
    return { kind: "node", nodeId };
  }

  // --- edge-anchored ------------------------------------------------------
  const byIndex = EDGE_INDEX_RE.exec(path);
  if (byIndex) {
    const edge = config.edges?.[Number(byIndex[1])];
    return edge ? { kind: "edge", edgeId: edge.id } : null;
  }
  const byId = EDGE_ID_RE.exec(path);
  if (byId) {
    // Only offer navigation to an edge that exists — "fallback edge not
    // found" names an id with nothing behind it.
    const exists = config.edges?.some((e) => e.id === byId[1]);
    return exists ? { kind: "edge", edgeId: byId[1] } : null;
  }

  // --- group-anchored -----------------------------------------------------
  const group = GROUP_RE.exec(path);
  if (group) {
    return config.nodeGroups?.[group[1]]
      ? { kind: "group", groupId: group[1] }
      : null;
  }

  // --- workflow-settings fields -------------------------------------------
  if (path === "entryNodeId") {
    const entry = config.entryNodeId;
    return entry && config.nodes?.[entry]
      ? { kind: "node", nodeId: entry }
      : { kind: "workflowSettings", focus: "entryNode" };
  }
  if (path === "metadata.ctx" || path.startsWith("ctx.")) {
    return { kind: "workflowSettings", focus: "ctx" };
  }
  const libraryPort = LIBRARY_PORT_RE.exec(path);
  if (libraryPort) {
    const descriptors =
      libraryPort[1] === "inputs"
        ? config.metadata?.inputs
        : config.metadata?.outputs;
    const descriptor = descriptors?.[Number(libraryPort[2])];
    const asNode = descriptor
      ? nodeFromDescriptorPath(descriptor.path, config)
      : null;
    return asNode ?? { kind: "workflowSettings", focus: "libraryPorts" };
  }

  // "" | schemaVersion | nodes | edges — genuinely workflow-level.
  return null;
}

/**
 * The right-aligned affordance the drawer shows on a row, so the user can see
 * a navigation exists before clicking.
 */
export function anchorActionHint(target: AnchorTarget): string {
  switch (target.kind) {
    case "nodeInput":
      return "Pick a source →";
    case "node":
      return "Select node →";
    case "edge":
      return "Show connection →";
    case "group":
      return "Show group →";
    case "workflowSettings":
      return "Open settings →";
  }
}
