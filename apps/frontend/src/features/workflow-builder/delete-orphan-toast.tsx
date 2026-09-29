/**
 * G-002's authoring facet, post-G-003: deleting a node that other steps depend
 * on is announced, not negotiated.
 *
 * Until undo existed, every delete path put a blocking `window.confirm` in
 * front of the author whenever the delete would orphan ctx variables other
 * steps still read. That dialog was always a stopgap (AUTO_WIRE_DESIGN.md
 * §2.3b): it interrupted the common case to protect against an uncommon
 * mistake that could not be taken back. With an undo stack in place the
 * mistake IS takeable back, so the delete happens immediately and the author
 * is told what broke, with one click to reverse it.
 *
 * A single toast per delete gesture, whatever the selection size — the counts
 * inside `describeOrphanedDelete` already roll up across every removed node.
 */
import { Anchor, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { describeOrphanedDelete } from "./delete-orphan-warning";

/**
 * Fixed id so a rapid second delete replaces the first toast rather than
 * stacking a queue of stale Undo links pointing at superseded history steps.
 */
export const ORPHANED_DELETE_TOAST_ID = "workflow-orphaned-delete";

/**
 * Shows the "what this delete broke" toast when `removedNodeIds` orphans
 * anything, and does nothing at all otherwise — which is the overwhelmingly
 * common case (deleting a leaf, or a node nobody reads from).
 *
 * `config` must be the PRE-delete config: which keys lose their sole writer is
 * only answerable while the writers are still there.
 *
 * @returns true when a toast was shown.
 */
export function showOrphanedDeleteToast(
  config: GraphWorkflowConfig,
  removedNodeIds: ReadonlySet<string>,
  onUndo: () => void,
): boolean {
  const warning = describeOrphanedDelete(config, removedNodeIds);
  if (!warning) return false;
  notifications.show({
    id: ORPHANED_DELETE_TOAST_ID,
    color: "yellow",
    title: "Deleted",
    message: (
      <Text size="sm" component="div">
        {warning.message}{" "}
        <Anchor
          component="button"
          type="button"
          data-testid="orphaned-delete-undo"
          onClick={() => {
            onUndo();
            notifications.hide(ORPHANED_DELETE_TOAST_ID);
          }}
        >
          Undo
        </Anchor>
      </Text>
    ),
    // Longer than the codebase's 3s norm: the reader has to parse which
    // variables and which steps before deciding whether to reach for Undo.
    autoClose: 8000,
  });
  return true;
}
