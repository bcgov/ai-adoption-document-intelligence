import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { ProducerPicker } from "./ProducerPicker";

function mount(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("ProducerPicker", () => {
  it("lists upstream producer node labels (not ctx keys)", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare file",
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Submit OCR",
        },
      },
      edges: [{ id: "e", source: "A", target: "B", type: "normal" }],
      entryNodeId: "A",
      ctx: {},
    };
    mount(
      <ProducerPicker
        config={config}
        consumerNodeId="B"
        expectedKind="Document"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Prepare file")).toBeInTheDocument();
  });

  it("excludes self and downstream producers, but offers detached ones as connectable", () => {
    // A → B → D. C is detached. B asks for a Document: A is upstream (normal
    // row), C is offerable-with-edge (UX walkthrough 2026-07-29), D is
    // downstream (connecting it back would cycle — excluded), B is self.
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "B",
        },
        C: {
          id: "C",
          type: "activity",
          activityType: "file.prepare",
          label: "C",
        },
        D: {
          id: "D",
          type: "activity",
          activityType: "file.prepare",
          label: "D",
        },
      },
      edges: [
        { id: "e", source: "A", target: "B", type: "normal" },
        { id: "e2", source: "B", target: "D", type: "normal" },
      ],
      entryNodeId: "A",
      ctx: {},
    };
    mount(
      <ProducerPicker
        config={config}
        consumerNodeId="B"
        expectedKind="Document"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(
      screen.getByTestId("producer-row-unconnected-C"),
    ).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
    expect(screen.queryByText("D")).not.toBeInTheDocument();
  });

  it("picking a detached producer flags needsEdge so the caller draws the edge", () => {
    const onChange = vi.fn();
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        Z: {
          id: "Z",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Z",
        },
        P: {
          id: "P",
          type: "activity",
          activityType: "file.prepare",
          label: "Loose producer",
        },
      },
      edges: [],
      entryNodeId: "Z",
      ctx: {},
    };
    mount(
      <ProducerPicker
        config={config}
        consumerNodeId="Z"
        expectedKind="Document"
        value=""
        onChange={onChange}
      />,
    );
    // The nothing-upstream-but-something-on-canvas explainer shows.
    expect(screen.getByTestId("producer-picker-empty")).toHaveTextContent(
      /a step on this canvas does/i,
    );
    screen.getByTestId("producer-row-unconnected-P").click();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        producerNodeId: "P",
        needsEdge: true,
      }),
    );
  });

  it("empty state explains the model (connect a producing step), not a dead-end", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        Z: {
          id: "Z",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Z",
        },
      },
      edges: [],
      entryNodeId: "Z",
      ctx: {},
    };
    mount(
      <ProducerPicker
        config={config}
        consumerNodeId="Z"
        expectedKind="Document"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no step in this workflow produces a document yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/connect it so it runs before this one/i),
    ).toBeInTheDocument();
  });

  it("ranks compatible producers by topological distance", () => {
    // A → B → C; both A and B emit Document. C asks for Document. B
    // (nearer) should render before A.
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare A",
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare B",
        },
        C: {
          id: "C",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "C",
        },
      },
      edges: [
        { id: "e0", source: "A", target: "B", type: "normal" },
        { id: "e1", source: "B", target: "C", type: "normal" },
      ],
      entryNodeId: "A",
      ctx: {},
    };
    const { container } = mount(
      <ProducerPicker
        config={config}
        consumerNodeId="C"
        expectedKind="Document"
        value=""
        onChange={vi.fn()}
      />,
    );
    const labels = Array.from(
      container.querySelectorAll("[data-testid='producer-row-label']"),
    ).map((el) => el.textContent);
    expect(labels[0]).toBe("Prepare B");
    expect(labels[1]).toBe("Prepare A");
  });
});
