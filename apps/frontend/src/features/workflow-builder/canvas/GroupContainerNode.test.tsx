/**
 * G-1 — the one container box, serving authored groups and map bodies alike.
 *
 * Replaces `MapBodyContainer.test.tsx`: the box is no longer map-specific, so
 * the cases pin what the two kinds share (size, label, a header that opens
 * something) and where they differ (icon, drag affordance).
 */

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type React from "react";
import { describe, expect, it } from "vitest";
import {
  containerIdForGroup,
  GROUP_HEADER_CLASS,
  type GroupContainerFlowNode,
  GroupContainerNode,
  groupIdFromContainerId,
} from "./GroupContainerNode";

function wrap(node: React.ReactNode) {
  return (
    <MantineProvider>
      <ReactFlowProvider>{node}</ReactFlowProvider>
    </MantineProvider>
  );
}

function makeData(
  overrides: Partial<GroupContainerFlowNode["data"]> = {},
): GroupContainerFlowNode["data"] {
  return {
    groupId: "g1",
    label: "OCR pair",
    color: "#7950f2",
    icon: "scan",
    width: 600,
    height: 300,
    onOpen: () => {
      // no-op default; tests override
    },
    ...overrides,
  };
}

function renderContainer(data: GroupContainerFlowNode["data"]) {
  return render(
    wrap(
      <GroupContainerNode
        id={containerIdForGroup(data.groupId)}
        type="group-container"
        data={data}
        selected={false}
        dragging={false}
        zIndex={0}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        deletable={false}
        draggable={true}
        selectable={false}
      />,
    ),
  );
}

describe("GroupContainerNode — id helpers", () => {
  it("round-trips a group id through the container id", () => {
    expect(groupIdFromContainerId(containerIdForGroup("g1"))).toBe("g1");
    expect(groupIdFromContainerId(containerIdForGroup("__map_body_m1"))).toBe(
      "__map_body_m1",
    );
  });

  it("returns null for anything that is not a container id", () => {
    expect(groupIdFromContainerId("group-chip-g1")).toBeNull();
    expect(groupIdFromContainerId("activity_1")).toBeNull();
    expect(groupIdFromContainerId("container-")).toBeNull();
  });
});

describe("GroupContainerNode — authored group", () => {
  it("renders the label, icon and the supplied size", () => {
    renderContainer(makeData());
    const el = screen.getByTestId("group-container-g1");
    expect(el).toHaveTextContent("OCR pair");
    expect(el).toHaveStyle({ width: "600px", height: "300px" });
    expect(screen.getByTestId("group-container-icon-g1")).toBeInTheDocument();
  });

  it("marks the header as the drag handle and advertises the gesture", () => {
    renderContainer(makeData());
    const header = screen.getByTestId("group-container-header-g1");
    // The class is what xyflow's `dragHandle` selector matches — dragging the
    // box anywhere else must not move the group (R-1).
    expect(header.className).toContain(GROUP_HEADER_CLASS);
    expect(header).toHaveStyle({ cursor: "grab" });
    expect(header.getAttribute("title")).toContain("Drag to move");
  });

  it("opens the group on a header click", () => {
    let opens = 0;
    renderContainer(
      makeData({
        onOpen: () => {
          opens += 1;
        },
      }),
    );
    screen.getByTestId("group-container-header-g1").click();
    expect(opens).toBe(1);
  });

  it("leaves the box body inert so clicks reach the members behind it", () => {
    renderContainer(makeData());
    expect(screen.getByTestId("group-container-g1")).toHaveStyle({
      pointerEvents: "none",
    });
    expect(screen.getByTestId("group-container-header-g1")).toHaveStyle({
      pointerEvents: "auto",
    });
  });
});

describe("GroupContainerNode — synthetic map body", () => {
  const syntheticData = () =>
    makeData({
      groupId: "__map_body_mapNode",
      label: "Process Each · body",
      color: "#22c55e",
      icon: undefined,
    });

  it("flags itself synthetic and offers no grab affordance", () => {
    renderContainer(syntheticData());
    const box = screen.getByTestId("group-container-__map_body_mapNode");
    expect(box.getAttribute("data-synthetic-group")).toBe("true");
    const header = screen.getByTestId(
      "group-container-header-__map_body_mapNode",
    );
    expect(header).toHaveStyle({ cursor: "pointer" });
    expect(header.getAttribute("title")).toBe("Open the map node's settings");
  });

  it("still opens the owning map node from its header", () => {
    let opens = 0;
    renderContainer({
      ...syntheticData(),
      onOpen: () => {
        opens += 1;
      },
    });
    screen.getByTestId("group-container-header-__map_body_mapNode").click();
    expect(opens).toBe(1);
  });
});
