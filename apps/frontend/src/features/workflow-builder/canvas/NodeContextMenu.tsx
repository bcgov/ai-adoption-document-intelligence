/**
 * Right-click context menu for canvas nodes (US-046).
 *
 * The menu is a controlled Mantine `Menu` anchored to a 1×1 invisible
 * `<div>` rendered at fixed viewport coordinates — that lets us pin the
 * dropdown to the cursor without xyflow node-coords translation. The
 * dropdown is rendered through Mantine's portal so it floats above the
 * canvas regardless of stacking contexts.
 *
 * Entries:
 *   - "Change activity type" — disabled when the node is a control-flow
 *     type (switch / map / join / childWorkflow / pollUntil / humanGate).
 *     A tooltip explains why. Wiring of the type-swap flow lives in
 *     US-047; this component just fires the supplied callback.
 *   - "Delete node" — always enabled; delegates to the existing canvas
 *     `handleNodesDelete` path via the supplied callback.
 *
 * Closing (B-3): Mantine's `closeOnClickOutside` is enabled and fires
 * `onChange(false)` → `onClose`, but it cannot be the whole story. It listens
 * on document `mousedown`, and xyflow's pane runs d3-zoom/d3-drag, which calls
 * `stopImmediatePropagation` on pane mousedown — so the listener sees clicks on
 * the chrome around the canvas and never sees a click on the canvas itself,
 * which is where the author actually clicks. The canvas therefore closes this
 * menu explicitly from `onPaneClick`, `onNodeClick` and `onMove`; the Mantine
 * listener stays for everything outside the pane, and `closeOnEscape` for the
 * keyboard.
 *
 * TARGET KIND (item 19, Inderdeep 2026-08-06). The menu opens on two different
 * kinds of thing, and they are not interchangeable:
 *
 *   - `target: "node"` (the default) — a real `config.nodes` entry. Every
 *     entry below applies.
 *   - `target: "group-container"` — the dashed box drawn behind a group's
 *     members. That box is a PROJECTION of `nodeGroups[<id>].nodeIds`, not a
 *     graph node: "Change activity type" has nothing to swap and "Delete node"
 *     would look for `config.nodes["container-<groupId>"]` and silently do
 *     nothing. So a container target renders Ungroup and nothing else.
 */

import { Menu, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import type { GraphNode } from "../../../types/workflow";

/** Same discriminator union the canvas uses to project nodes. */
export type NodeContextMenuNodeType = GraphNode["type"];

/** What the right-click landed on — see the TARGET KIND note above. */
export type NodeContextMenuTarget = "node" | "group-container";

interface NodeContextMenuCommonProps {
  /** Viewport-relative position the menu pins to (event.clientX/Y). */
  position: { x: number; y: number };
  /** Fired when the menu should close (click-away, item action, Escape). */
  onClose: () => void;
}

export interface NodeContextMenuNodeProps extends NodeContextMenuCommonProps {
  /**
   * Optional on this variant so every existing call site keeps meaning "a
   * graph node" without restating it.
   */
  target?: "node";
  /** Identifier of the node the menu was opened for. */
  nodeId: string;
  /** Discriminator type from the node's `GraphNode["type"]`. */
  nodeType: NodeContextMenuNodeType;
  /**
   * Activity-type-swap callback. Wired to the type-picker flow in
   * US-047; from this story's perspective it's just an arbitrary callback
   * the entry invokes when clicked (and only when the entry is enabled).
   */
  onChangeActivityType: () => void;
  /**
   * Delete-node callback. The canvas wires this to its existing
   * `handleNodesDelete` so the menu's delete entry and the keyboard
   * delete key share the same removal path.
   */
  onDelete: () => void;
  /**
   * Phase 6 (US-183): the node's activity-type string. Used to detect
   * Phase 6 dynamic-node instances (`type.startsWith("dyn.")`) so the
   * menu can offer an "Edit script" entry that opens the in-situ editor.
   * Optional so non-activity nodes (switch/map/etc.) still work unchanged.
   */
  activityType?: string;
  /**
   * Phase 6 (US-183): edit-script callback. Fires when the user clicks
   * "Edit script" on a `dyn.*` node — the canvas wires this to open the
   * DynamicNodeEditor modal scoped to the node's slug.
   */
  onEditScript?: () => void;
  /**
   * UX walkthrough 2026-07-29 — label of the user group this node
   * belongs to, when it belongs to one. Enables the "Ungroup" entry so
   * ungrouping is discoverable from the canvas instead of undo-only.
   */
  groupLabel?: string;
  /**
   * Ungroup callback — removes the containing group entry (nodes stay).
   * Only rendered when `groupLabel` is set.
   */
  onUngroup?: () => void;
  /**
   * W-3 — how many nodes are selected when the menu opens, counting the node
   * it opened on. Above 1 the menu switches to SELECTION mode: the entries act
   * on the whole selection, and the per-node entries (type swap, edit script)
   * are dropped because they have no meaning for a set.
   *
   * The canvas only passes a count above 1 when the right-clicked node is
   * itself part of that selection — right-clicking outside it resets the
   * selection to that node first, so the menu never claims to act on nodes the
   * gesture just deselected.
   */
  selectionCount?: number;
  /** Deletes every selected node in one config write (one undo step). */
  onDeleteSelection?: () => void;
  /**
   * S-1 — groups the selection. Optional because grouping is the host's
   * operation (`createGroupFromSelection` lives on the editor page); when the
   * host supplies no handler the entry is simply absent.
   */
  onGroupSelection?: () => void;
}

/**
 * Item 19 (Inderdeep 2026-08-06) — the menu opened by right-clicking a group's
 * container box. *"I was trying to ungroup it … I'm just right clicking.
 * Nothing is happening. And then I realized, oh, I need to be on a particular
 * node."* One entry, because one entry is all that means anything on a
 * projection of a group.
 */
export interface NodeContextMenuGroupContainerProps
  extends NodeContextMenuCommonProps {
  target: "group-container";
  /** `config.nodeGroups` key the container projects. */
  groupId: string;
  /** The group's label, quoted in the entry so it names what it removes. */
  groupLabel: string;
  /** Removes the group entry; its steps stay on the canvas. */
  onUngroup: () => void;
}

export type NodeContextMenuProps =
  | NodeContextMenuNodeProps
  | NodeContextMenuGroupContainerProps;

const CONTROL_FLOW_TYPE_SWAP_TOOLTIP =
  "Control-flow nodes can't be type-swapped";

function isActivityType(nodeType: NodeContextMenuNodeType): boolean {
  return nodeType === "activity";
}

interface MenuShellProps {
  position: { x: number; y: number };
  onClose: () => void;
  /** Stamped on the Mantine `Menu` so tests + tooling can see what it targets. */
  dataNodeId?: string;
  dataGroupId?: string;
  children: ReactNode;
}

/**
 * The Mantine plumbing both target kinds share: an invisible 1×1 anchor at the
 * cursor, the portal dropdown, and the close wiring. Extracted so the two
 * menus differ only in their entries.
 */
function MenuShell({
  position,
  onClose,
  dataNodeId,
  dataGroupId,
  children,
}: MenuShellProps) {
  return (
    <Menu
      opened
      onChange={(opened) => {
        if (!opened) onClose();
      }}
      position="bottom-start"
      withinPortal
      closeOnClickOutside
      closeOnEscape
      shadow="md"
      width={220}
      data-node-id={dataNodeId}
      data-group-id={dataGroupId}
    >
      <Menu.Target>
        {/*
         * Invisible anchor pinned to the click position. Mantine's Menu
         * needs a target ref to compute floating positioning; a 1×1
         * fixed-position div is the simplest reliable trigger when the
         * menu has no on-page anchor element of its own.
         */}
        <div
          data-testid="node-context-menu-anchor"
          style={{
            position: "fixed",
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Menu.Target>
      <Menu.Dropdown data-testid="node-context-menu">{children}</Menu.Dropdown>
    </Menu>
  );
}

export function NodeContextMenu(props: NodeContextMenuProps) {
  if (props.target === "group-container") {
    return <GroupContainerContextMenu {...props} />;
  }
  return <GraphNodeContextMenu {...props} />;
}

function GroupContainerContextMenu({
  groupId,
  groupLabel,
  position,
  onClose,
  onUngroup,
}: NodeContextMenuGroupContainerProps) {
  const handleUngroup = () => {
    onUngroup();
    onClose();
  };
  return (
    <MenuShell position={position} onClose={onClose} dataGroupId={groupId}>
      <Menu.Label>Group “{groupLabel}”</Menu.Label>
      <Menu.Item data-testid="context-menu-ungroup" onClick={handleUngroup}>
        Ungroup “{groupLabel}” (steps stay)
      </Menu.Item>
    </MenuShell>
  );
}

function GraphNodeContextMenu({
  nodeId,
  nodeType,
  position,
  onClose,
  onChangeActivityType,
  onDelete,
  activityType,
  onEditScript,
  groupLabel,
  onUngroup,
  selectionCount = 1,
  onDeleteSelection,
  onGroupSelection,
}: NodeContextMenuNodeProps) {
  const canChangeActivityType = isActivityType(nodeType);
  const isDynamicNode =
    canChangeActivityType && activityType?.startsWith("dyn.");
  const isSelection = selectionCount > 1;

  const handleChangeActivityType = () => {
    onChangeActivityType();
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  const handleEditScript = () => {
    if (onEditScript) onEditScript();
    onClose();
  };

  const handleUngroup = () => {
    if (onUngroup) onUngroup();
    onClose();
  };

  const handleDeleteSelection = () => {
    if (onDeleteSelection) onDeleteSelection();
    onClose();
  };

  const handleGroupSelection = () => {
    if (onGroupSelection) onGroupSelection();
    onClose();
  };

  return (
    <MenuShell position={position} onClose={onClose} dataNodeId={nodeId}>
      {isSelection ? (
        <>
          <Menu.Label>{selectionCount} steps selected</Menu.Label>
          {onGroupSelection && (
            <Menu.Item
              data-testid="context-menu-group-selection"
              onClick={handleGroupSelection}
            >
              Group these {selectionCount} steps
            </Menu.Item>
          )}
          {groupLabel && onUngroup && (
            <Menu.Item
              data-testid="context-menu-ungroup"
              onClick={handleUngroup}
            >
              Ungroup “{groupLabel}” (steps stay)
            </Menu.Item>
          )}
          <Menu.Item
            data-testid="context-menu-delete-selection"
            color="red"
            onClick={handleDeleteSelection}
          >
            Delete {selectionCount} steps
          </Menu.Item>
        </>
      ) : (
        <SingleNodeEntries />
      )}
    </MenuShell>
  );

  /**
   * The per-node entries, unchanged. Declared as a nested component so the
   * selection branch above reads as one choice between two whole menus rather
   * than a chain of conditionals inside a single list.
   */
  function SingleNodeEntries() {
    return (
      <>
        {canChangeActivityType ? (
          <Menu.Item
            data-testid="context-menu-change-activity-type"
            onClick={handleChangeActivityType}
          >
            Change activity type
          </Menu.Item>
        ) : (
          <Tooltip label={CONTROL_FLOW_TYPE_SWAP_TOOLTIP} withArrow>
            {/*
             * Mantine disables click events on `<Menu.Item disabled>` —
             * the Tooltip wraps a span so the hover detector still
             * receives pointer events even when the item itself is
             * non-interactive.
             */}
            <span>
              <Menu.Item
                data-testid="context-menu-change-activity-type"
                disabled
              >
                Change activity type
              </Menu.Item>
            </span>
          </Tooltip>
        )}
        {isDynamicNode && onEditScript && (
          <Menu.Item
            data-testid="context-menu-edit-script"
            onClick={handleEditScript}
          >
            Edit script
          </Menu.Item>
        )}
        {groupLabel && onUngroup && (
          <Menu.Item data-testid="context-menu-ungroup" onClick={handleUngroup}>
            Ungroup “{groupLabel}” (steps stay)
          </Menu.Item>
        )}
        <Menu.Item
          data-testid="context-menu-delete-node"
          color="red"
          onClick={handleDelete}
        >
          Delete node
        </Menu.Item>
      </>
    );
  }
}
