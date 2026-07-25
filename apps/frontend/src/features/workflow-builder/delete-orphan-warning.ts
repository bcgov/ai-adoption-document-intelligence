/**
 * The pre-delete warning for G-002's authoring facet.
 *
 * Deleting a node can leave ctx variables with no writer while other steps
 * still read them. That state is only detectable AT the deletion — afterwards a
 * declared-but-unwritten key is indistinguishable from a workflow input — so
 * the delete path asks first and then prunes the orphaned declarations, which
 * is what makes the consumers visibly break instead of silently failing at run
 * time.
 *
 * Pure: the caller owns both the confirmation prompt and the config write.
 */
import {
  findOrphanedCtxKeys,
  type OrphanedCtxKey,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../types/workflow";

export interface OrphanedDeleteWarning {
  /** Confirmation copy, already pluralised. */
  message: string;
  /** Keys to hand to `pruneCtxDeclarations` once the author confirms. */
  ctxKeys: string[];
  /** The full finding, for callers that want to render more detail. */
  orphaned: OrphanedCtxKey[];
}

/**
 * Describes what deleting `removedNodeIds` will orphan, or `null` when it
 * orphans nothing — which is the overwhelmingly common case (deleting a leaf,
 * or a node whose outputs nobody reads). Returning `null` is what keeps the
 * guard off ordinary edits: a dialog on every delete would be worse than the
 * bug it protects against.
 */
export function describeOrphanedDelete(
  config: GraphWorkflowConfig,
  removedNodeIds: ReadonlySet<string>,
): OrphanedDeleteWarning | null {
  const orphaned = findOrphanedCtxKeys(config, removedNodeIds);
  if (orphaned.length === 0) return null;

  const readers = new Set<string>();
  for (const entry of orphaned) {
    for (const nodeId of entry.consumerNodeIds) readers.add(nodeId);
  }

  const subject = describeSubject(config, removedNodeIds);
  const variables =
    orphaned.length === 1 ? "1 variable" : `${orphaned.length} variables`;
  const steps = readers.size === 1 ? "1 step" : `${readers.size} steps`;
  const verb = readers.size === 1 ? "reads" : "read";
  const object = orphaned.length === 1 ? "it" : "them";

  return {
    message: `${subject} leaves ${variables} without a source; ${steps} ${verb} ${object}. Continue?`,
    ctxKeys: orphaned.map((entry) => entry.ctxKey),
    orphaned,
  };
}

/** `Deleting "Prepare File"` for one node; `Deleting these 3 steps` for many. */
function describeSubject(
  config: GraphWorkflowConfig,
  removedNodeIds: ReadonlySet<string>,
): string {
  if (removedNodeIds.size !== 1) {
    return `Deleting these ${removedNodeIds.size} steps`;
  }
  const [nodeId] = [...removedNodeIds];
  const label = config.nodes[nodeId]?.label;
  return `Deleting "${label || nodeId}"`;
}
