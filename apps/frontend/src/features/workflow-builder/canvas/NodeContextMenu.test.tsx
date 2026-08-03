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
  activityType?: string;
  x?: number;
  y?: number;
}

function renderMenu(
  options: RenderOptions & {
    groupLabel?: string;
    selectionCount?: number;
    withGroupSelection?: boolean;
  } = {},
  callbacks: {
    onClose?: () => void;
    onChangeActivityType?: () => void;
    onDelete?: () => void;
    onUngroup?: () => void;
    onDeleteSelection?: () => void;
    onGroupSelection?: () => void;
  } = {},
) {
  const onClose = callbacks.onClose ?? vi.fn();
  const onChangeActivityType = callbacks.onChangeActivityType ?? vi.fn();
  const onDelete = callbacks.onDelete ?? vi.fn();
  const onUngroup = callbacks.onUngroup ?? vi.fn();
  const onDeleteSelection = callbacks.onDeleteSelection ?? vi.fn();
  const onGroupSelection = callbacks.onGroupSelection ?? vi.fn();
  const utils = render(
    <MantineProvider>
      <NodeContextMenu
        nodeId={options.nodeId ?? "node_1"}
        nodeType={options.nodeType ?? "activity"}
        activityType={options.activityType}
        position={{ x: options.x ?? 50, y: options.y ?? 60 }}
        onClose={onClose}
        onChangeActivityType={onChangeActivityType}
        onDelete={onDelete}
        groupLabel={options.groupLabel}
        onUngroup={options.groupLabel ? onUngroup : undefined}
        selectionCount={options.selectionCount}
        onDeleteSelection={onDeleteSelection}
        onGroupSelection={
          options.withGroupSelection === false ? undefined : onGroupSelection
        }
      />
    </MantineProvider>,
  );
  return {
    ...utils,
    onClose,
    onChangeActivityType,
    onDelete,
    onUngroup,
    onDeleteSelection,
    onGroupSelection,
  };
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

// ---------------------------------------------------------------------------
// UX walkthrough 2026-07-29 — "Ungroup" entry for grouped nodes.
//   Before this, the only ungroup paths were undo and the right-rail group
//   settings; right-clicking a grouped node (the thing he actually tried)
//   offered nothing.
// ---------------------------------------------------------------------------

describe("NodeContextMenu — Ungroup entry", () => {
  it("shows the entry with the group label and fires onUngroup + onClose", async () => {
    const onUngroup = vi.fn();
    const onClose = vi.fn();
    renderMenu({ groupLabel: "OCR pair" }, { onUngroup, onClose });
    await waitFor(() => {
      expect(screen.getByTestId("context-menu-ungroup")).toBeInTheDocument();
    });
    expect(screen.getByTestId("context-menu-ungroup")).toHaveTextContent(
      "OCR pair",
    );
    fireEvent.click(screen.getByTestId("context-menu-ungroup"));
    expect(onUngroup).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders no Ungroup entry for a node outside any group", async () => {
    renderMenu({});
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("context-menu-ungroup"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// W-3 (2026-08-03) — right-clicking one of several selected nodes used to show
// the single-node menu, and "Delete node" removed exactly one of them.
// ---------------------------------------------------------------------------

describe("NodeContextMenu — selection mode", () => {
  it("acts on the whole selection and says how many", async () => {
    const { onDeleteSelection, onClose } = renderMenu({ selectionCount: 3 });
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    expect(screen.getByTestId("node-context-menu")).toHaveTextContent(
      "3 steps selected",
    );
    const del = screen.getByTestId("context-menu-delete-selection");
    expect(del).toHaveTextContent("Delete 3 steps");
    fireEvent.click(del);
    expect(onDeleteSelection).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Group, so grouping is reachable without the top bar (S-1)", async () => {
    const { onGroupSelection } = renderMenu({ selectionCount: 2 });
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-group-selection"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("context-menu-group-selection"),
    ).toHaveTextContent("Group these 2 steps");
    fireEvent.click(screen.getByTestId("context-menu-group-selection"));
    expect(onGroupSelection).toHaveBeenCalledTimes(1);
  });

  it("drops the per-node entries, which mean nothing for a set", async () => {
    renderMenu({ selectionCount: 3, activityType: "dyn.demo" });
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("context-menu-change-activity-type"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("context-menu-edit-script"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("context-menu-delete-node"),
    ).not.toBeInTheDocument();
  });

  it("stays in single-node mode for a selection of one", async () => {
    renderMenu({ selectionCount: 1 });
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-node"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("context-menu-delete-selection"),
    ).not.toBeInTheDocument();
  });

  it("omits Group when the host supplies no handler", async () => {
    renderMenu({ selectionCount: 3, withGroupSelection: false });
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-selection"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("context-menu-group-selection"),
    ).not.toBeInTheDocument();
  });
});
