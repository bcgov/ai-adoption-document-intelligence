/**
 * Right-click context menu for canvas wires (PORT_WIRING_DESIGN.md §7).
 *
 * Mirrors `NodeContextMenu`'s shape: a controlled Mantine `Menu` anchored to
 * a 1×1 invisible `<div>` rendered at fixed viewport coordinates, so the
 * dropdown pins to the cursor without xyflow node-coords translation. The
 * dropdown renders through Mantine's portal so it floats above the canvas
 * regardless of stacking contexts.
 *
 * Data wires and run-order (sequence) wires get this menu. Branch and
 * error-path wires keep the browser's native right-click behaviour; the
 * canvas is responsible for not opening this component for those.
 *
 * Data-wire entries:
 *   - "View data" — only shown when `canViewData` (a run has happened);
 *     selects the edge to open the data peek popover.
 *   - "Disconnect" — always shown; same effect as deleting the wire via the
 *     keyboard/delete-key path (routes through the canvas's
 *     `disconnectWires` — pinned unbound + one-shot hint when applicable).
 *   - "Revert to automatic" — only shown when `wire.pinned` is true; hands
 *     the port back to the resolver (`revertPortToAutomatic`), which drops
 *     the lock so the next `resolveBindings` pass re-derives the binding.
 *
 * Run-order wire entry:
 *   - "Remove run order" — same effect as selecting the dashed wire and
 *     pressing Delete: the edge between the two steps is removed.
 *
 * Click-away closes the menu through Mantine's default `closeOnClickOutside`
 * behaviour, which fires `onChange(false)` — wired to `onClose`.
 */

import { Menu } from "@mantine/core";
import type { DataWire, StructuralWire } from "./derive-wires";

export interface WireContextMenuProps {
  /** Whether the menu is currently open. */
  opened: boolean;
  /** Viewport-relative position the menu pins to (event.clientX/Y). */
  x: number;
  /** Viewport-relative position the menu pins to (event.clientX/Y). */
  y: number;
  /** The data or run-order wire the menu was opened for; null when closed. */
  wire: DataWire | StructuralWire | null;
  /** Whether the "View data" item should show (a run has happened). */
  canViewData: boolean;
  /** Open the data peek for this wire (selects the edge). */
  onViewData: (wire: DataWire) => void;
  /** Fired when the menu should close (click-away, item action, Escape). */
  onClose: () => void;
  /** Disconnect the wire — same effect as deleting it. */
  onDisconnect: (wire: DataWire) => void;
  /** Hand the wire's target port back to the resolver. */
  onRevert: (wire: DataWire) => void;
  /** Remove a run-order wire — same effect as deleting it. */
  onRemoveRunOrder: (wire: StructuralWire) => void;
}

export function WireContextMenu({
  opened,
  x,
  y,
  wire,
  canViewData,
  onViewData,
  onClose,
  onDisconnect,
  onRevert,
  onRemoveRunOrder,
}: WireContextMenuProps) {
  if (!opened || !wire) return null;

  /** Run a menu action, then close the menu. */
  const thenClose = (action: () => void) => () => {
    action();
    onClose();
  };

  const dataWireItems = (dataWire: DataWire) => (
    <>
      {canViewData && (
        <Menu.Item
          data-testid="wire-menu-view-data"
          onClick={thenClose(() => onViewData(dataWire))}
        >
          View data
        </Menu.Item>
      )}
      {dataWire.pinned && (
        <Menu.Item
          data-testid="wire-menu-revert"
          onClick={thenClose(() => onRevert(dataWire))}
        >
          Revert to automatic
        </Menu.Item>
      )}
      <Menu.Item
        data-testid="wire-menu-disconnect"
        color="red"
        onClick={thenClose(() => onDisconnect(dataWire))}
      >
        Disconnect
      </Menu.Item>
    </>
  );

  const runOrderWireItems = (runOrderWire: StructuralWire) => (
    <Menu.Item
      data-testid="wire-menu-remove-run-order"
      color="red"
      onClick={thenClose(() => onRemoveRunOrder(runOrderWire))}
    >
      Remove run order
    </Menu.Item>
  );

  return (
    <Menu
      opened
      onChange={(nextOpened) => {
        if (!nextOpened) onClose();
      }}
      position="bottom-start"
      withinPortal
      closeOnClickOutside
      closeOnEscape
      shadow="md"
      width={220}
      transitionProps={{ duration: 0 }}
    >
      <Menu.Target>
        {/*
         * Invisible anchor pinned to the click position. Mantine's Menu
         * needs a target ref to compute floating positioning; a 1×1
         * fixed-position div is the simplest reliable trigger when the
         * menu has no on-page anchor element of its own.
         */}
        <div
          data-testid="wire-context-menu-anchor"
          style={{
            position: "fixed",
            left: `${x}px`,
            top: `${y}px`,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Menu.Target>
      <Menu.Dropdown data-testid="wire-context-menu">
        {wire.variant === "data"
          ? dataWireItems(wire)
          : runOrderWireItems(wire)}
      </Menu.Dropdown>
    </Menu>
  );
}
