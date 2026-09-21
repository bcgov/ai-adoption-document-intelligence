/**
 * G-009 — the find-a-node affordance. Scoped to the current graph (not the
 * palette), and selecting a result must select AND reveal the node.
 */
import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  PollUntilNode,
} from "../../types/workflow";
import { NodeSearchBox } from "./NodeSearchBox";

function makeConfig(): GraphWorkflowConfig {
  const prepare: ActivityNode = {
    id: "prep_1",
    type: "activity",
    label: "Prepare the file",
    activityType: "file.prepare",
  };
  const submit: ActivityNode = {
    id: "ocr_1",
    type: "activity",
    label: "Send to OCR",
    activityType: "azureOcr.submit",
  };
  const poll: PollUntilNode = {
    id: "poll_1",
    type: "pollUntil",
    label: "Wait for the result",
    activityType: "azureOcr.getResult",
    interval: "30s",
    condition: { operator: "is-not-null", value: { ref: "ocrResult" } },
  };
  return {
    schemaVersion: "1.0",
    metadata: { name: "t", version: "1.0.0" },
    ctx: {},
    nodes: { prep_1: prepare, ocr_1: submit, poll_1: poll },
    edges: [],
    entryNodeId: "prep_1",
  };
}

function renderBox(onSelectNode = vi.fn()) {
  render(
    <MantineProvider>
      <NodeSearchBox config={makeConfig()} onSelectNode={onSelectNode} />
    </MantineProvider>,
  );
  return { onSelectNode, input: screen.getByTestId("node-search-input") };
}

describe("NodeSearchBox", () => {
  it("finds nodes by label", () => {
    const { input } = renderBox();
    fireEvent.change(input, { target: { value: "wait for" } });
    expect(screen.getByTestId("node-search-result-poll_1")).toBeInTheDocument();
    expect(screen.queryByTestId("node-search-result-ocr_1")).toBeNull();
  });

  it("finds nodes by activity type", () => {
    const { input } = renderBox();
    fireEvent.change(input, { target: { value: "azureOcr" } });
    expect(screen.getByTestId("node-search-result-ocr_1")).toBeInTheDocument();
    expect(screen.getByTestId("node-search-result-poll_1")).toBeInTheDocument();
    expect(screen.queryByTestId("node-search-result-prep_1")).toBeNull();
  });

  it("selects and reveals the chosen result", () => {
    const { input, onSelectNode } = renderBox();
    fireEvent.change(input, { target: { value: "prepare" } });
    fireEvent.click(screen.getByTestId("node-search-result-prep_1"));
    // One callback: the page routes it through `selectNodeSticky` +
    // `revealNodes` (batch 8) — this component must not own selection.
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith("prep_1");
    // Picking a result closes the list and clears the query.
    expect(screen.queryByTestId("node-search-result-prep_1")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("says so when the graph has no match", () => {
    const { input } = renderBox();
    fireEvent.change(input, { target: { value: "zzz nothing" } });
    expect(screen.getByTestId("node-search-empty")).toHaveTextContent(
      /no node matches/i,
    );
  });

  it("shows nothing until the author types", () => {
    renderBox();
    expect(screen.queryByTestId("node-search-empty")).toBeNull();
    expect(screen.queryByTestId("node-search-result-prep_1")).toBeNull();
  });
});
