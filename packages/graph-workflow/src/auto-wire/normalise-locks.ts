import type { GraphNode, GraphWorkflowConfig, PortBinding } from "../types";
import { isAutoCtxKey } from "./synthesise-ctx-key";
import { getLockedInputPorts, getLockedOutputPorts } from "./lock-list";

/**
 * One-shot pass that populates `metadata.lockedInputPorts` /
 * `metadata.lockedOutputPorts` for every binding whose ctx key is NOT
 * `__auto.`-prefixed. Idempotent. See AUTO_WIRE_DESIGN.md §2.3.
 */
export function normaliseLocks(
  config: GraphWorkflowConfig,
): GraphWorkflowConfig {
  const nextNodes: Record<string, GraphNode> = {};
  let mutated = false;
  for (const [id, node] of Object.entries(config.nodes)) {
    const inferredInput = inferLocks(node.inputs);
    const inferredOutput = inferLocks(node.outputs);

    const existingInput = getLockedInputPorts(node);
    const existingOutput = getLockedOutputPorts(node);

    const mergedInput = unique([...existingInput, ...inferredInput]);
    const mergedOutput = unique([...existingOutput, ...inferredOutput]);

    if (
      sameSet(existingInput, mergedInput) &&
      sameSet(existingOutput, mergedOutput)
    ) {
      nextNodes[id] = node;
      continue;
    }

    mutated = true;
    const existing = node.metadata ?? {};
    nextNodes[id] = {
      ...node,
      metadata: {
        ...existing,
        ...(mergedInput.length > 0
          ? { lockedInputPorts: mergedInput }
          : {}),
        ...(mergedOutput.length > 0
          ? { lockedOutputPorts: mergedOutput }
          : {}),
      },
    } as GraphNode;
  }
  return mutated ? { ...config, nodes: nextNodes } : config;
}

function inferLocks(bindings: PortBinding[] | undefined): string[] {
  if (!bindings) return [];
  return bindings.filter((b) => !isAutoCtxKey(b.ctxKey)).map((b) => b.port);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const v of b) if (!sa.has(v)) return false;
  return true;
}
