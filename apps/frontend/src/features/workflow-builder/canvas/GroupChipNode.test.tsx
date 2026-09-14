/**
 * Tests for `GroupChipNode` (US-043).
 *
 * The chip is an xyflow custom-node component, so we render it directly
 * with a fixture `NodeProps`-shaped object — same approach the
 * `WorkflowEditorCanvas` test file uses for the activity / control-flow
 * renderers (via the mocked `nodeTypes`).
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type GroupChipFlowNode,
  GroupChipNode,
  type GroupChipNodeData,
} from "./GroupChipNode";

// ---------------------------------------------------------------------------
// Mocks — xyflow is replaced with a thin shim that surfaces Handle props as
// data-testid markers (same shape as the WorkflowEditorCanvas tests). The
// chip renderer should mount one target + one source handle so xyflow can
// wire chip → external edges identically to activity rectangles.
// ---------------------------------------------------------------------------

vi.mock("@xyflow/react", () => ({
  Handle: ({
    type,
    position,
    id,
  }: {
    type: string;
    position: string;
    id?: string;
  }) => (
    <div
      data-testid={`handle-${type}-${position}`}
      data-handleid={id ?? null}
    />
  ),
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeData(
  overrides: Partial<GroupChipNodeData> = {},
): GroupChipNodeData {
  return {
    groupId: "g1",
    label: "Cleanup steps",
    icon: "cleanup",
    color: "#5b8def",
    nodeCount: 3,
    memberNodeIds: ["n1", "n2", "n3"],
    ...overrides,
  };
}

function renderChip(
  opts: { selected?: boolean; data?: Partial<GroupChipNodeData> } = {},
) {
  const node: GroupChipFlowNode = {
    id: "group-chip-g1",
    type: "group-chip",
    position: { x: 0, y: 0 },
    data: makeData(opts.data),
    selected: opts.selected ?? false,
  };
  // GroupChipNode is wrapped in React.memo; rendering it directly
  // mirrors how xyflow invokes nodeTypes[node.type].
  return render(
    <MantineProvider>
      <GroupChipNode
        id={node.id}
        type="group-chip"
        data={node.data}
        selected={node.selected ?? false}
        dragging={false}
        zIndex={0}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        deletable={false}
        draggable={false}
        selectable={false}
      />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe("GroupChipNode", () => {
  it("renders the group label", () => {
    renderChip({ data: { label: "Cleanup steps" } });
    expect(screen.getByText("Cleanup steps")).toBeInTheDocument();
  });

  it("renders a node-count Badge with the correct member count", () => {
    renderChip({ data: { nodeCount: 3 } });
    const badge = screen.getByTestId("group-chip-node-count");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3 nodes");
  });

  it("singularizes the node-count Badge for a one-member group", () => {
    renderChip({ data: { nodeCount: 1 } });
    expect(screen.getByTestId("group-chip-node-count")).toHaveTextContent(
      "1 node",
    );
  });

  it("renders the icon when an icon key is supplied (reuses GROUP_ICONS)", () => {
    renderChip({ data: { icon: "cleanup" } });
    // Tabler icons render as <svg class="tabler-icon ..." />. The icon
    // sits inside the chip's data-testid="group-chip-icon" wrapper.
    const wrapper = screen.getByTestId("group-chip-icon");
    const svg = wrapper.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class") ?? "").toMatch(/tabler-icon/);
  });

  it("omits the icon wrapper when no icon key is supplied", () => {
    renderChip({ data: { icon: undefined } });
    expect(screen.queryByTestId("group-chip-icon")).toBeNull();
  });

  it("mounts a target (left) + source (right) handle so xyflow can wire edges", () => {
    renderChip();
    expect(screen.getByTestId("handle-target-left")).toBeInTheDocument();
    expect(screen.getByTestId("handle-source-right")).toBeInTheDocument();
  });

  it("applies a selected-state ring style when xyflow says the node is selected", () => {
    const { container } = renderChip({ selected: true });
    const chipEl = container.querySelector(
      "[data-testid='canvas-group-chip-g1']",
    ) as HTMLElement | null;
    expect(chipEl).not.toBeNull();
    // boxShadow string should contain the 0 0 0 2px ring used by the
    // activity rectangle's selected style — defence in depth so a visual
    // regression in the chip code is caught.
    expect(chipEl?.style.boxShadow ?? "").toContain("0 0 0 2px");
  });

  it("does NOT apply the selected ring when selected is false", () => {
    const { container } = renderChip({ selected: false });
    const chipEl = container.querySelector(
      "[data-testid='canvas-group-chip-g1']",
    ) as HTMLElement | null;
    expect(chipEl).not.toBeNull();
    expect(chipEl?.style.boxShadow ?? "").not.toContain("0 0 0 2px");
  });
});
