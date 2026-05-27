import type { GraphNode, GraphWorkflowConfig, PortBinding } from "../types";
import { isAutoCtxKey } from "./synthesise-ctx-key";
import { getLockedInputPorts, getLockedOutputPorts } from "./lock-list";

/**
 * Save-time helper. Drops `lockedInputPorts` / `lockedOutputPorts`
 * entries whose corresponding binding's ctxKey is NOT `__auto.`-prefixed
 * — those locks are implicit (they'll be re-derived by `normaliseLocks`
 * on load). Drops the metadata fields entirely when the arrays empty.
 * See AUTO_WIRE_DESIGN.md §3.
 */
export function stripRedundantLocks(
  config: GraphWorkflowConfig,
): GraphWorkflowConfig {
  const nextNodes: Record<string, GraphNode> = {};
  let mutated = false;
  for (const [id, node] of Object.entries(config.nodes)) {
    if (!node.metadata) {
      nextNodes[id] = node;
      continue;
    }
    const trimmedInput = trimLockList(getLockedInputPorts(node), node.inputs);
    const trimmedOutput = trimLockList(
      getLockedOutputPorts(node),
      node.outputs,
    );

    const nextMetadata: Record<string, unknown> = { ...node.metadata };
    if (trimmedInput.length > 0) {
      nextMetadata.lockedInputPorts = trimmedInput;
    } else {
      delete nextMetadata.lockedInputPorts;
    }
    if (trimmedOutput.length > 0) {
      nextMetadata.lockedOutputPorts = trimmedOutput;
    } else {
      delete nextMetadata.lockedOutputPorts;
    }

    const hasMetadata = Object.keys(nextMetadata).length > 0;
    const nextNode: GraphNode = hasMetadata
      ? ({ ...node, metadata: nextMetadata } as GraphNode)
      : (() => {
          const { metadata: _omit, ...rest } = node as GraphNode & {
            metadata?: unknown;
          };
          return rest as GraphNode;
        })();

    if (JSON.stringify(node) !== JSON.stringify(nextNode)) {
      mutated = true;
      nextNodes[id] = nextNode;
    } else {
      nextNodes[id] = node;
    }
  }
  return mutated ? { ...config, nodes: nextNodes } : config;
}

function trimLockList(
  locks: string[],
  bindings: PortBinding[] | undefined,
): string[] {
  return locks.filter((portName) => {
    const binding = bindings?.find((b) => b.port === portName);
    if (!binding) return true; // keep — unusual, but preserve explicit intent
    return isAutoCtxKey(binding.ctxKey);
  });
}
