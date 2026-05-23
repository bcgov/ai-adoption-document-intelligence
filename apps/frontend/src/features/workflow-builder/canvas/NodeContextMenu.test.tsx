/**
 * Tests for `NodeContextMenu` (US-046).
 *
 * Acceptance scenarios live in
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-046-canvas-context-menu.md
 *
 * The component is a controlled Mantine Menu pinned to a click position
 * (x, y in viewport coordinates) — these tests assert each menu entry's
 * enabled/disabled state per node type, its callbacks, and the
 * click-outside-closes behaviour.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphNode } from "../../../types/workflow";
import { NodeContextMenu } from "./NodeContextMenu";

interface RenderOptions {
  nodeId?: string;
  nodeType?: GraphNode["type"];
  x?: number;
  y?: number;
}

function renderMenu(
  options: RenderOptions = {},
  callbacks: {
    onClose?: () => void;
    onChangeActivityType?: () => void;
    onDelete?: () => void;
  } = {},
) {
  const onClose = callbacks.onClose ?? vi.fn();
  const onChangeActivityType = callbacks.onChangeActivityType ?? vi.fn();
  const onDelete = callbacks.onDelete ?? vi.fn();
  const utils = render(
    <MantineProvider>
      <NodeContextMenu
        nodeId={options.nodeId ?? "node_1"}
        nodeType={options.nodeType ?? "activity"}
        position={{ x: options.x ?? 50, y: options.y ?? 60 }}
        onClose={onClose}
        onChangeActivityType={onChangeActivityType}
        onDelete={onDelete}
      />
    </MantineProvider>,
  );
  return { ...utils, onClose, onChangeActivityType, onDelete };
}

describe("NodeContextMenu — Scenario 1: activity node menu", () => {
  it("renders both entries with 'Change activity type' enabled and 'Delete node' enabled", async () => {
    renderMenu({ nodeType: "activity" });
    // Menu renders into a portal — wait for the dropdown to mount.
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    const changeType = screen.getByTestId("context-menu-change-activity-type");
    const deleteNode = screen.getByTestId("context-menu-delete-node");
    expect(changeType).toBeInTheDocument();
    expect(deleteNode).toBeInTheDocument();
    // Mantine sets `data-disabled` on disabled Menu.Item — activity nodes
    // can be type-swapped so the attribute must be absent / not "true".
    expect(changeType).not.toHaveAttribute("data-disabled", "true");
    expect(deleteNode).not.toHaveAttribute("data-disabled", "true");
  });

  it("clicking 'Change activity type' fires onChangeActivityType", async () => {
    const onChangeActivityType = vi.fn();
    renderMenu({ nodeType: "activity" }, { onChangeActivityType });
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-change-activity-type"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-change-activity-type"));
    expect(onChangeActivityType).toHaveBeenCalledTimes(1);
  });

  it("clicking 'Delete node' fires onDelete", async () => {
    const onDelete = vi.fn();
    renderMenu({ nodeType: "activity" }, { onDelete });
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-node"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-delete-node"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("NodeContextMenu — Scenario 2: control-flow node disables 'Change activity type'", () => {
  it.each([
    "switch",
    "map",
    "join",
    "childWorkflow",
    "pollUntil",
    "humanGate",
  ] as const)("disables 'Change activity type' when nodeType is %s", async (nodeType) => {
    renderMenu({ nodeType });
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-change-activity-type"),
      ).toBeInTheDocument();
    });
    const changeType = screen.getByTestId("context-menu-change-activity-type");
    expect(changeType).toHaveAttribute("data-disabled", "true");
    // Delete remains enabled even on control-flow nodes.
    const deleteNode = screen.getByTestId("context-menu-delete-node");
    expect(deleteNode).not.toHaveAttribute("data-disabled", "true");
  });

  it("does NOT fire onChangeActivityType when the disabled entry is clicked on a switch node", async () => {
    const onChangeActivityType = vi.fn();
    renderMenu({ nodeType: "switch" }, { onChangeActivityType });
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-change-activity-type"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-change-activity-type"));
    expect(onChangeActivityType).not.toHaveBeenCalled();
  });
});

describe("NodeContextMenu — Scenario 3: click-away closes the menu", () => {
  it("invokes onClose when the user clicks outside the menu", async () => {
    const onClose = vi.fn();
    renderMenu({ nodeType: "activity" }, { onClose });
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    // Mantine Menu treats a body click as "outside" and fires onClose
    // through `closeOnClickOutside`. The library's useClickOutside hook
    // listens for `mousedown` + `touchstart` on the document by default.
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe("NodeContextMenu — Scenario 4: menu is anchored to the supplied position", () => {
  it("renders an anchor element positioned at the given viewport coordinates", () => {
    renderMenu({ x: 123, y: 234 });
    const anchor = screen.getByTestId("node-context-menu-anchor");
    expect(anchor).toBeInTheDocument();
    expect(anchor.style.position).toBe("fixed");
    expect(anchor.style.left).toBe("123px");
    expect(anchor.style.top).toBe("234px");
  });
});
