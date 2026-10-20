import "@testing-library/jest-dom";
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

  // Without a heading, nothing says the options are previous steps' outputs.
  // The heading is what says it, so it is the thing under test.
  it("names what the list is, above the rows", () => {
    mount(
      <ConditionProducerPicker
        config={chainConfig()}
        currentNodeId="C"
        value=""
        onChange={vi.fn()}
      />,
    );
    const heading = screen.getByTestId("condition-producer-heading");
    expect(heading).toHaveTextContent("Outputs of earlier steps");
    expect(heading).toHaveTextContent(
      "Each row is one output of a step that runs before this one",
    );
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

  it("offers no step of its own to a condition on a step without outputs", () => {
    mount(
      <ConditionProducerPicker
        config={chainConfig()}
        currentNodeId="C"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("condition-producer-own-heading"),
    ).not.toBeInTheDocument();
  });
});

// A → P(poll, consumer). The poll step's condition reads the status its own
// attempts return, the way the Standard OCR template's does.
function pollConfig(): GraphWorkflowConfig {
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
      P: {
        id: "P",
        type: "pollUntil",
        activityType: "azureOcr.poll",
        label: "Poll OCR Results",
        condition: {
          operator: "not-equals",
          left: { ref: "ctx.ocrStatus" },
          right: { literal: "running" },
        },
        interval: "5s",
        outputs: [
          { port: "ocrResponse", ctxKey: "ocrResponseRef" },
          { port: "status", ctxKey: "ocrStatus" },
        ],
      },
    },
    edges: [{ id: "e1", source: "A", target: "P", type: "normal" }],
    ctx: {},
  };
}

describe("ConditionProducerPicker — a poll step's own condition", () => {
  it("lists the step's own outputs first, under their own heading", () => {
    mount(
      <ConditionProducerPicker
        config={pollConfig()}
        currentNodeId="P"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("condition-producer-own-heading"),
    ).toHaveTextContent("This step's result");
    const rows = screen
      .getAllByTestId("condition-producer-row")
      .map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("Poll OCR Results → OCR response");
    expect(rows[0]).toContain("this step");
    expect(rows[1]).toContain("Poll OCR Results → Poll status");
    expect(rows[2]).toContain("Prepare file → Prepared file data");
    expect(rows[2]).toContain("1 step upstream");
  });

  it("selects the output the stored ctx-prefixed ref reads", () => {
    mount(
      <ConditionProducerPicker
        config={pollConfig()}
        currentNodeId="P"
        value="ctx.ocrStatus"
        onChange={vi.fn()}
      />,
    );
    const row = screen
      .getByText("Poll OCR Results → Poll status")
      .closest("[data-testid='condition-producer-row']");
    expect(row).toHaveAttribute("data-selected", "true");
    const others = screen
      .getAllByTestId("condition-producer-row")
      .filter((r) => r !== row);
    for (const other of others) {
      expect(other).toHaveAttribute("data-selected", "false");
    }
  });

  it("emits the step itself as the producer when its own row is picked", () => {
    const onChange = vi.fn();
    mount(
      <ConditionProducerPicker
        config={pollConfig()}
        currentNodeId="P"
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Poll OCR Results → Poll status"));
    expect(onChange).toHaveBeenCalledWith({
      producerNodeId: "P",
      producerPort: "status",
    });
  });
});
