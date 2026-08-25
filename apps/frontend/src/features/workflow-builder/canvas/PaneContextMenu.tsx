/**
 * Right-click context menu for the empty canvas (P-4).
 *
 * `onPaneContextMenu` was never registered, so nodes and wires served the
 * workflow's own menu while the pane between them served the browser's — the
 * one place on the canvas where right-click meant "reload / view source".
 *
 * Structurally identical to `NodeContextMenu`: a controlled Mantine `Menu`
 * anchored to a 1×1 invisible `<div>` at fixed viewport coordinates, portalled
 * so it floats above the canvas whatever the stacking context. It is closed
 * explicitly by the canvas on pane click, node click and pan/zoom — Mantine's
 * `closeOnClickOutside` never sees a click on the pane, because xyflow's
 * d3-zoom handler calls `stopImmediatePropagation` on pane mousedown (B-3).
 * The listener is still enabled: it covers clicks on the chrome around the
 * canvas, which the xyflow callbacks don't reach.
 *
 * Entries:
 *   - "Add node here" — opens the node catalogue pinned to the click point;
 *     the pick lands there rather than at the next free slot.
 *   - "Auto-arrange" / "Fit view" / "Select all" — the viewport and layout
 *     actions that otherwise live in the top bar, at the cursor. Disabled on an
 *     empty canvas, where each of them is a no-op with something to say (an
 *     arrange of nothing still costs an undo step).
 */

import { Menu } from "@mantine/core";

export interface PaneContextMenuProps {
  /** Viewport-relative position the menu pins to (event.clientX/Y). */
  position: { x: number; y: number };
  /**
   * Whether the graph has any nodes. The three layout/selection entries act on
   * nodes, so with none they are shown disabled rather than hidden — the menu
   * keeps a stable shape and stays legible as "these exist, there is just
   * nothing to apply them to yet".
   */
  hasNodes: boolean;
  /** Fired when the menu should close (click-away, item action, Escape). */
  onClose: () => void;
  /** Opens the node picker at the right-clicked point. */
  onAddNode: () => void;
  /** Re-runs the dagre layout over the whole graph. */
  onAutoArrange: () => void;
  /** Fits every node into the viewport. */
  onFitView: () => void;
  /** Selects every selectable node on the canvas. */
  onSelectAll: () => void;
}

export function PaneContextMenu({
  position,
  hasNodes,
  onClose,
  onAddNode,
  onAutoArrange,
  onFitView,
  onSelectAll,
}: PaneContextMenuProps) {
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
      width={200}
    >
      <Menu.Target>
        {/*
         * Invisible anchor pinned to the click position — Mantine's Menu needs
         * a target ref to compute floating positioning, and the pane has no
         * element of its own to anchor to.
         */}
        <div
          data-testid="pane-context-menu-anchor"
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
      <Menu.Dropdown data-testid="pane-context-menu">
        <Menu.Item data-testid="pane-menu-add-node" onClick={onAddNode}>
          Add node here
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          data-testid="pane-menu-auto-arrange"
          disabled={!hasNodes}
          onClick={onAutoArrange}
        >
          Auto-arrange
        </Menu.Item>
        <Menu.Item
          data-testid="pane-menu-fit-view"
          disabled={!hasNodes}
          onClick={onFitView}
        >
          Fit view
        </Menu.Item>
        <Menu.Item
          data-testid="pane-menu-select-all"
          disabled={!hasNodes}
          onClick={onSelectAll}
        >
          Select all
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
