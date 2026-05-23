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
 * Click-away closes the menu through Mantine's default `closeOnClickOutside`
 * behaviour, which fires `onChange(false)` — wired to `onClose`.
 */

import { Menu, Tooltip } from "@mantine/core";
import type { GraphNode } from "../../../types/workflow";

/** Same discriminator union the canvas uses to project nodes. */
export type NodeContextMenuNodeType = GraphNode["type"];

export interface NodeContextMenuProps {
  /** Identifier of the node the menu was opened for. */
  nodeId: string;
  /** Discriminator type from the node's `GraphNode["type"]`. */
  nodeType: NodeContextMenuNodeType;
  /** Viewport-relative position the menu pins to (event.clientX/Y). */
  position: { x: number; y: number };
  /** Fired when the menu should close (click-away, item action, Escape). */
  onClose: () => void;
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
}

const CONTROL_FLOW_TYPE_SWAP_TOOLTIP =
  "Control-flow nodes can't be type-swapped";

function isActivityType(nodeType: NodeContextMenuNodeType): boolean {
  return nodeType === "activity";
}

export function NodeContextMenu({
  nodeId,
  nodeType,
  position,
  onClose,
  onChangeActivityType,
  onDelete,
}: NodeContextMenuProps) {
  const canChangeActivityType = isActivityType(nodeType);

  const handleChangeActivityType = () => {
    onChangeActivityType();
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

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
      data-node-id={nodeId}
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
      <Menu.Dropdown data-testid="node-context-menu">
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
        <Menu.Item
          data-testid="context-menu-delete-node"
          color="red"
          onClick={handleDelete}
        >
          Delete node
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
