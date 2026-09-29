/**
 * Tests for `PaneContextMenu` (P-4).
 *
 * The component is a controlled Mantine Menu pinned to a click position
 * (x, y in viewport coordinates) — these tests assert the entries it offers,
 * which of them survive an empty canvas, that each fires its callback, and
 * that Escape / click-away close it. The canvas-side wiring (where the click
 * point comes from, what each action does to the graph) is covered in
 * `WorkflowEditorCanvas.test.tsx`.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaneContextMenu } from "./PaneContextMenu";

function renderMenu(
  options: { hasNodes?: boolean; x?: number; y?: number } = {},
) {
  const onClose = vi.fn();
  const onAddNode = vi.fn();
  const onAutoArrange = vi.fn();
  const onFitView = vi.fn();
  const onSelectAll = vi.fn();
  const utils = render(
    <MantineProvider>
      <PaneContextMenu
        position={{ x: options.x ?? 50, y: options.y ?? 60 }}
        hasNodes={options.hasNodes ?? true}
        onClose={onClose}
        onAddNode={onAddNode}
        onAutoArrange={onAutoArrange}
        onFitView={onFitView}
        onSelectAll={onSelectAll}
      />
    </MantineProvider>,
  );
  return {
    ...utils,
    onClose,
    onAddNode,
    onAutoArrange,
    onFitView,
    onSelectAll,
  };
}

describe("PaneContextMenu", () => {
  it("renders every entry, enabled, when the canvas has nodes", async () => {
    renderMenu({ hasNodes: true });
    // The dropdown renders into a portal — wait for it to mount.
    await waitFor(() => {
      expect(screen.getByTestId("pane-context-menu")).toBeInTheDocument();
    });
    for (const [testId, label] of [
      ["pane-menu-add-node", "Add node here"],
      ["pane-menu-auto-arrange", "Auto-arrange"],
      ["pane-menu-fit-view", "Fit view"],
      ["pane-menu-select-all", "Select all"],
    ] as const) {
      const entry = screen.getByTestId(testId);
      expect(entry).toHaveTextContent(label);
      expect(entry).not.toHaveAttribute("data-disabled", "true");
    }
  });

  it("pins the anchor to the click position", async () => {
    renderMenu({ x: 320, y: 210 });
    const anchor = screen.getByTestId("pane-context-menu-anchor");
    expect(anchor).toHaveStyle({ position: "fixed", left: "320px" });
    expect(anchor).toHaveStyle({ top: "210px" });
  });

  it("disables the node actions when the canvas is empty", async () => {
    renderMenu({ hasNodes: false });
    await waitFor(() => {
      expect(screen.getByTestId("pane-context-menu")).toBeInTheDocument();
    });
    // Adding is the only thing an empty canvas can do.
    expect(screen.getByTestId("pane-menu-add-node")).not.toHaveAttribute(
      "data-disabled",
      "true",
    );
    for (const testId of [
      "pane-menu-auto-arrange",
      "pane-menu-fit-view",
      "pane-menu-select-all",
    ]) {
      expect(screen.getByTestId(testId)).toHaveAttribute(
        "data-disabled",
        "true",
      );
    }
  });

  it.each([
    ["pane-menu-add-node", "onAddNode"],
    ["pane-menu-auto-arrange", "onAutoArrange"],
    ["pane-menu-fit-view", "onFitView"],
    ["pane-menu-select-all", "onSelectAll"],
  ] as const)("%s fires %s", async (testId, callbackName) => {
    const handles = renderMenu({ hasNodes: true });
    await waitFor(() => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(testId));
    expect(handles[callbackName]).toHaveBeenCalledTimes(1);
  });

  it("fires no callback for a disabled entry", async () => {
    const { onAutoArrange } = renderMenu({ hasNodes: false });
    await waitFor(() => {
      expect(screen.getByTestId("pane-menu-auto-arrange")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("pane-menu-auto-arrange"));
    expect(onAutoArrange).not.toHaveBeenCalled();
  });

  it("closes on a click outside the canvas", async () => {
    const { onClose } = renderMenu();
    await waitFor(() => {
      expect(screen.getByTestId("pane-context-menu")).toBeInTheDocument();
    });
    // Mantine's `useClickOutside` listens for `mousedown`. It never sees a
    // click on the xyflow pane (B-3) — the canvas closes the menu from
    // `onPaneClick` for that — but it still covers the surrounding chrome.
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("closes on Escape", async () => {
    const { onClose } = renderMenu();
    await waitFor(() => {
      expect(screen.getByTestId("pane-context-menu")).toBeInTheDocument();
    });
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
