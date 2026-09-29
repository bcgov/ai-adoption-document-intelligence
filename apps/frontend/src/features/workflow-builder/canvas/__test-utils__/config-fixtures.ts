/**
 * Shared `GraphWorkflowConfig` fixture builders for canvas-layer unit
 * tests (`derive-wires.test.ts` and later specs in this directory).
 *
 * Kept minimal on purpose — a thin `node()`/`config()` pair, not a DSL.
 * Mirrors the `makeConfig` helper pattern used by
 * `auto-wire-validation.test.ts`, generalized to accept full `GraphEdge`
 * rows (id/type included) since wire-derivation tests need conditional
 * and error edges, not just the default `normal` shape.
 */
import type {
  CtxDeclaration,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";

/**
 * Builds a `GraphNode` from a partial input that already satisfies one of
 * the discriminated-union node shapes (caller supplies `id` + `type` +
 * whatever fields that node type requires). `label` defaults to `id` when
 * omitted. The generic parameter pins the concrete node shape so callers
 * get full field checking (e.g. `node<ActivityNode>({...})`).
 */
export function node<T extends GraphNode>(
  partial: Omit<T, "label"> & Partial<Pick<T, "label">>,
): T {
  return { label: partial.id, ...partial } as T;
}

export interface ConfigFixtureInput {
  nodes: Record<string, GraphNode>;
  edges?: GraphEdge[];
  entryNodeId?: string;
  ctx?: Record<string, CtxDeclaration>;
}

/**
 * Builds a `GraphWorkflowConfig` from just the parts a given test cares
 * about. `entryNodeId` defaults to the first node key; `edges`/`ctx`
 * default to empty.
 */
export function config(input: ConfigFixtureInput): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "fixture" },
    nodes: input.nodes,
    edges: input.edges ?? [],
    entryNodeId: input.entryNodeId ?? Object.keys(input.nodes)[0] ?? "",
    ctx: input.ctx ?? {},
  };
}
