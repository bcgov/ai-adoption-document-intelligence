/**
 * Right-click context menu for canvas data wires (PORT_WIRING_DESIGN.md §7).
 *
 * Mirrors `NodeContextMenu`'s shape: a controlled Mantine `Menu` anchored to
 * a 1×1 invisible `<div>` rendered at fixed viewport coordinates, so the
 * dropdown pins to the cursor without xyflow node-coords translation. The
 * dropdown renders through Mantine's portal so it floats above the canvas
 * regardless of stacking contexts.
 *
 * Only DATA wires get this menu — structural (sequence/conditional/error)
 * wires keep the browser's native right-click behaviour; the canvas is
 * responsible for not opening this component for those.
 *
 * Entries:
 *   - "Disconnect" — always shown; same effect as deleting the wire via the
 *     keyboard/delete-key path (routes through the canvas's
 *     `disconnectWires` — pinned unbound + one-shot hint when applicable).
 *   - "Revert to automatic" — only shown when `wire.pinned` is true; hands
 *     the port back to the resolver (`revertPortToAutomatic`), which drops
 *     the lock so the next `resolveBindings` pass re-derives the binding.
 *
 * Click-away closes the menu through Mantine's default `closeOnClickOutside`
 * behaviour, which fires `onChange(false)` — wired to `onClose`.
 */

import { Menu } from "@mantine/core";
import type { DataWire } from "./derive-wires";

export interface WireContextMenuProps {
  /** Whether the menu is currently open. */
  opened: boolean;
  /** Viewport-relative position the menu pins to (event.clientX/Y). */
  x: number;
  /** Viewport-relative position the menu pins to (event.clientX/Y). */
  y: number;
  /** The data wire the menu was opened for; null when closed. */
  wire: DataWire | null;
  /** Fired when the menu should close (click-away, item action, Escape). */
  onClose: () => void;
  /** Disconnect the wire — same effect as deleting it. */
  onDisconnect: (wire: DataWire) => void;
  /** Hand the wire's target port back to the resolver. */
  onRevert: (wire: DataWire) => void;
}

export function WireContextMenu({
  opened,
  x,
  y,
  wire,
  onClose,
  onDisconnect,
  onRevert,
}: WireContextMenuProps) {
  if (!opened || !wire) return null;

  const handleDisconnect = () => {
    onDisconnect(wire);
    onClose();
  };

  const handleRevert = () => {
    onRevert(wire);
    onClose();
  };

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
        {wire.pinned && (
          <Menu.Item data-testid="wire-menu-revert" onClick={handleRevert}>
            Revert to automatic
          </Menu.Item>
        )}
        <Menu.Item
          data-testid="wire-menu-disconnect"
          color="red"
          onClick={handleDisconnect}
        >
          Disconnect
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
