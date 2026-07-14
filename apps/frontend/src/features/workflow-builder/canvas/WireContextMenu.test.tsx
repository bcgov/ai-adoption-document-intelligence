/**
 * Tests for `WireContextMenu` (port-wiring Phase 3, design §7).
 *
 * The component is a controlled Mantine Menu pinned to a click position
 * (x, y in viewport coordinates) — these tests assert each menu entry's
 * presence per wire pin state and its callbacks.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DataWire } from "./derive-wires";
import { WireContextMenu } from "./WireContextMenu";

function makeWire(overrides: Partial<DataWire> = {}): DataWire {
  return {
    variant: "data",
    id: "wire:submit:inA",
    source: "prep",
    sourcePort: "outA",
    target: "submit",
    targetPort: "inA",
    pinned: false,
    auto: false,
    ctxKey: "k1",
    ...overrides,
  };
}

function renderMenu(
  wire: DataWire,
  callbacks: {
    onClose?: () => void;
    onDisconnect?: (wire: DataWire) => void;
    onRevert?: (wire: DataWire) => void;
  } = {},
) {
  const onClose = callbacks.onClose ?? vi.fn();
  const onDisconnect = callbacks.onDisconnect ?? vi.fn();
  const onRevert = callbacks.onRevert ?? vi.fn();
  const utils = render(
    <MantineProvider>
      <WireContextMenu
        opened
        x={50}
        y={60}
        wire={wire}
        onClose={onClose}
        onDisconnect={onDisconnect}
        onRevert={onRevert}
      />
    </MantineProvider>,
  );
  return { ...utils, onClose, onDisconnect, onRevert };
}

describe("WireContextMenu — auto (unpinned) wire", () => {
  it("renders Disconnect and hides Revert to automatic", async () => {
    renderMenu(makeWire({ pinned: false }));
    await waitFor(() => {
      expect(screen.getByTestId("wire-context-menu")).toBeInTheDocument();
    });
    expect(screen.getByTestId("wire-menu-disconnect")).toBeInTheDocument();
    expect(screen.queryByTestId("wire-menu-revert")).not.toBeInTheDocument();
  });
});

describe("WireContextMenu — pinned wire", () => {
  it("renders both Revert to automatic and Disconnect", async () => {
    renderMenu(makeWire({ pinned: true }));
    await waitFor(() => {
      expect(screen.getByTestId("wire-context-menu")).toBeInTheDocument();
    });
    expect(screen.getByTestId("wire-menu-revert")).toBeInTheDocument();
    expect(screen.getByTestId("wire-menu-disconnect")).toBeInTheDocument();
  });
});

describe("WireContextMenu — actions", () => {
  it("fires onDisconnect with the wire and closes", async () => {
    const wire = makeWire({ pinned: true });
    const onDisconnect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderMenu(wire, { onDisconnect, onClose });
    await waitFor(() => {
      expect(screen.getByTestId("wire-menu-disconnect")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("wire-menu-disconnect"));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith(wire);
    // Mantine's Menu also fires `onChange(false)` on item click
    // (closeOnItemClick) in addition to our explicit `onClose()` call, so
    // this may fire more than once — assert it fired, not an exact count.
    expect(onClose).toHaveBeenCalled();
  });

  it("fires onRevert with the wire and closes", async () => {
    const wire = makeWire({ pinned: true });
    const onRevert = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderMenu(wire, { onRevert, onClose });
    await waitFor(() => {
      expect(screen.getByTestId("wire-menu-revert")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("wire-menu-revert"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onRevert).toHaveBeenCalledWith(wire);
    expect(onClose).toHaveBeenCalled();
  });
});
