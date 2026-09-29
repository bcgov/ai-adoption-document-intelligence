import type { GraphNode, GraphWorkflowConfig } from "../../types/workflow";

/**
 * Return a new config with a single node replaced (or inserted) by id.
 *
 * §6.3: the node-settings forms each hand-rolled the same
 * `{ ...config, nodes: { ...config.nodes, [id]: next } }` splice in a local
 * `updateNode`. Centralising it keeps the (shallow-immutable) update shape
 * in one place.
 */
export function replaceNode(
  config: GraphWorkflowConfig,
  nodeId: string,
  node: GraphNode,
): GraphWorkflowConfig {
  return { ...config, nodes: { ...config.nodes, [nodeId]: node } };
}
