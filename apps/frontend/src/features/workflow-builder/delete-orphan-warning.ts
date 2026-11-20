/**
 * G-002's authoring facet: naming what a delete broke.
 *
 * Deleting a node can leave ctx variables with no writer while other steps
 * still read them. That state is only detectable AT the deletion — afterwards a
 * declared-but-unwritten key is indistinguishable from a workflow input — so
 * the delete path describes the damage and then prunes the orphaned
 * declarations, which is what makes the consumers visibly break instead of
 * silently failing at run time.
 *
 * The message is written in the past tense because it is reported AFTER the
 * fact: since G-003 landed, deletion is immediate and reversible, and the
 * blocking confirm this module used to own is gone. See delete-orphan-toast.tsx
 * and AUTO_WIRE_DESIGN.md §2.3b.
 *
 * Pure: the caller owns both the notification and the config write.
 */
import {
  findOrphanedCtxKeys,
  type OrphanedCtxKey,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { resolveNextEntryNodeId } from "./canvas/remove-nodes";

export interface OrphanedDeleteWarning {
  /** Toast copy, already pluralised. */
  message: string;
  /** Keys `removeNodesFromConfig` prunes as part of the delete. */
  ctxKeys: string[];
  /** The full finding, for callers that want to render more detail. */
  orphaned: OrphanedCtxKey[];
  /**
   * G-039 — set when the delete removed the entry node, naming the node the
   * config will promote in its place. Read from `resolveNextEntryNodeId`, the
   * same function the delete uses, so the toast cannot name a different node
   * from the one actually adopted.
   */
  promotedEntryNodeId?: string;
}

/**
 * Describes what deleting `removedNodeIds` orphans, or `null` when it orphans
 * nothing — which is the overwhelmingly common case (deleting a leaf, or a node
 * whose outputs nobody reads). Returning `null` is what keeps ordinary edits
 * silent: a toast on every delete would be noise, and noise gets ignored.
 *
 * Call with the PRE-delete config; the writers have to still be present for
 * "which keys lose their sole writer" to be answerable.
 */
export function describeOrphanedDelete(
  config: GraphWorkflowConfig,
  removedNodeIds: ReadonlySet<string>,
): OrphanedDeleteWarning | null {
  const orphaned = findOrphanedCtxKeys(config, removedNodeIds);

  // G-039 — deleting the entry node silently promotes a survivor. That is a
  // change to where the workflow STARTS, which is at least as consequential as
  // an orphaned variable and was reported nowhere at all. It can fire on its
  // own, so it is checked before the orphan early-return.
  const entryRemoved = removedNodeIds.has(config.entryNodeId);
  const promotedEntryNodeId = entryRemoved
    ? resolveNextEntryNodeId(config, removedNodeIds)
    : undefined;

  if (orphaned.length === 0) {
    if (!entryRemoved) return null;
    return {
      message: `${describeSubject(config, removedNodeIds)} — ${describePromotion(config, promotedEntryNodeId)}`,
      ctxKeys: [],
      orphaned: [],
      promotedEntryNodeId,
    };
  }

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
  const possessive = orphaned.length === 1 ? "its" : "their";

  const entryClause = entryRemoved
    ? ` ${describePromotion(config, promotedEntryNodeId)}`
    : "";

  return {
    message: `${subject} — ${variables} lost ${possessive} source; ${steps} ${verb} ${object}.${entryClause}`,
    ctxKeys: orphaned.map((entry) => entry.ctxKey),
    orphaned,
    ...(promotedEntryNodeId === undefined ? {} : { promotedEntryNodeId }),
  };
}

/** `"Prepare File" is now the starting step.` / the empty-graph wording. */
function describePromotion(
  config: GraphWorkflowConfig,
  promotedEntryNodeId: string | undefined,
): string {
  if (!promotedEntryNodeId) {
    return "that was the starting step, and nothing is left to start from.";
  }
  const label = config.nodes[promotedEntryNodeId]?.label || promotedEntryNodeId;
  return `that was the starting step, so "${label}" now starts the workflow.`;
}

/** `Deleted "Prepare File"` for one node; `Deleted 3 steps` for many. */
function describeSubject(
  config: GraphWorkflowConfig,
  removedNodeIds: ReadonlySet<string>,
): string {
  if (removedNodeIds.size !== 1) {
    return `Deleted ${removedNodeIds.size} steps`;
  }
  const [nodeId] = [...removedNodeIds];
  const label = config.nodes[nodeId]?.label;
  return `Deleted "${label || nodeId}"`;
}
