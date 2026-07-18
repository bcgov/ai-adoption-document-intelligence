import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type React from "react";
import { describe, expect, it } from "vitest";
import {
  MapBodyContainer,
  type MapBodyContainerFlowNode,
} from "./MapBodyContainer";

function wrap(node: React.ReactNode) {
  return (
    <MantineProvider>
      <ReactFlowProvider>{node}</ReactFlowProvider>
    </MantineProvider>
  );
}

function makeNode(): MapBodyContainerFlowNode {
  return {
    id: "container-mapNode",
    type: "map-body-container",
    position: { x: 0, y: 0 },
    data: {
      groupId: "__map_body_mapNode",
      label: "Process Each · body",
      color: "#22c55e",
      width: 600,
      height: 300,
      onClick: () => {
        // no-op default; tests override
      },
    },
  };
}

function renderContainer(data: MapBodyContainerFlowNode["data"]) {
  return render(
    wrap(
      <MapBodyContainer
        id="x"
        type="map-body-container"
        data={data}
        selected={false}
        dragging={false}
        zIndex={0}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        deletable={false}
        draggable={false}
        selectable={false}
      />,
    ),
  );
}

describe("MapBodyContainer", () => {
  it("renders the label and uses the supplied size", () => {
    renderContainer(makeNode().data);
    const el = screen.getByTestId("map-body-container-__map_body_mapNode");
    expect(el).toHaveTextContent("Process Each · body");
    expect(el).toHaveStyle({ width: "600px", height: "300px" });
  });

  it("invokes onClick when the label is clicked", () => {
    let clicks = 0;
    const data = {
      ...makeNode().data,
      onClick: () => {
        clicks += 1;
      },
    };
    renderContainer(data);
    // The interactive target is the label chip; the box body itself is
    // pointer-events:none so clicks fall through to nodes / the canvas pane.
    const box = screen.getByTestId("map-body-container-__map_body_mapNode");
    const label = box.querySelector("button");
    expect(label).not.toBeNull();
    label?.click();
    expect(clicks).toBe(1);
  });
});
