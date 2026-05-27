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

  it("excludes downstream and self producers", () => {
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
    expect(screen.queryByText("C")).not.toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
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
