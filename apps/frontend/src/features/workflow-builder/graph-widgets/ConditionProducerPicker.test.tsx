import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { ConditionProducerPicker } from "./ConditionProducerPicker";

function mount(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

// A → B → C(consumer). A: file.prepare (preparedData:Document).
// B: azureOcr.submit (apimRequestId, statusCode, headers — all Artifact).
function chainConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "A",
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
      C: { id: "C", type: "switch", label: "Branch", cases: [] },
    },
    edges: [
      { id: "e1", source: "A", target: "B", type: "normal" },
      { id: "e2", source: "B", target: "C", type: "normal" },
    ],
    ctx: {},
  };
}

describe("ConditionProducerPicker", () => {
  it("lists every upstream output port with no kind filter", () => {
    mount(
      <ConditionProducerPicker
        config={chainConfig()}
        currentNodeId="C"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Submit OCR → Request ID")).toBeInTheDocument();
    expect(
      screen.getByText("Submit OCR → Submission status code"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Prepare file → Prepared file data"),
    ).toBeInTheDocument();
  });

  it("emits { producerNodeId, producerPort } on click", () => {
    const onChange = vi.fn();
    mount(
      <ConditionProducerPicker
        config={chainConfig()}
        currentNodeId="C"
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Prepare file → Prepared file data"));
    expect(onChange).toHaveBeenCalledWith({
      producerNodeId: "A",
      producerPort: "preparedData",
    });
  });

  it("marks the row matching the current value as selected", () => {
    mount(
      <ConditionProducerPicker
        config={chainConfig()}
        currentNodeId="C"
        value="__auto.A.preparedData"
        onChange={vi.fn()}
      />,
    );
    const row = screen
      .getByText("Prepare file → Prepared file data")
      .closest("[data-testid='condition-producer-row']");
    expect(row).toHaveAttribute("data-selected", "true");
  });

  it("shows the empty state when there are no upstream producers", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "C",
      nodes: { C: { id: "C", type: "switch", label: "Branch", cases: [] } },
      edges: [],
      ctx: {},
    };
    mount(
      <ConditionProducerPicker
        config={config}
        currentNodeId="C"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("condition-producer-empty")).toBeInTheDocument();
  });
});
