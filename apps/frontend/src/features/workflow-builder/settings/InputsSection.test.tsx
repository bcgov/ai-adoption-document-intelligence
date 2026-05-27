import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { InputsSection } from "./InputsSection";

function mount(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("InputsSection", () => {
  it("shows an auto-bound row with the producer node's label and an 'auto' pill", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare A",
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "B",
          inputs: [{ port: "fileData", ctxKey: "__auto.A.preparedData" }],
        },
      },
      edges: [{ id: "e", source: "A", target: "B", type: "normal" }],
      entryNodeId: "A",
      ctx: {},
    };
    mount(
      <InputsSection config={config} nodeId="B" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText("Prepare A")).toBeInTheDocument();
    expect(screen.getByText(/auto/i)).toBeInTheDocument();
  });

  it("shows an ambiguous chip when two equidistant producers compete", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        X: {
          id: "X",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare X",
        },
        Y: {
          id: "Y",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare Y",
        },
        Z: {
          id: "Z",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Z",
        },
      },
      edges: [
        { id: "e0", source: "X", target: "Z", type: "normal" },
        { id: "e1", source: "Y", target: "Z", type: "normal" },
      ],
      entryNodeId: "X",
      ctx: {},
    };
    mount(
      <InputsSection config={config} nodeId="Z" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText(/choose source/i)).toBeInTheDocument();
  });

  it("shows a red 'Needs source' chip when no upstream producer matches", () => {
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
      <InputsSection config={config} nodeId="Z" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText(/needs source/i)).toBeInTheDocument();
  });

  it("clicking 'Override' on an auto row adds the port to lockedInputPorts and stamps the new binding", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare A",
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
        },
        ALT: {
          id: "ALT",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare ALT",
          outputs: [
            { port: "preparedData", ctxKey: "__auto.ALT.preparedData" },
          ],
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "B",
          inputs: [{ port: "fileData", ctxKey: "__auto.A.preparedData" }],
        },
      },
      edges: [
        { id: "e0", source: "A", target: "B", type: "normal" },
        { id: "e1", source: "ALT", target: "B", type: "normal" },
      ],
      entryNodeId: "A",
      ctx: {},
    };
    mount(
      <InputsSection
        config={config}
        nodeId="B"
        onConfigChange={onConfigChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /override/i }));
    await user.click(screen.getByText("Prepare ALT"));

    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[0][0];
    expect(next.nodes.B.metadata.lockedInputPorts).toContain("fileData");
    expect(next.nodes.B.inputs).toContainEqual({
      port: "fileData",
      ctxKey: "__auto.ALT.preparedData",
    });
  });

  it("clicking 'Revert to auto' removes the port from lockedInputPorts", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare A",
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "B",
          inputs: [{ port: "fileData", ctxKey: "preparedDataManual" }],
          metadata: { lockedInputPorts: ["fileData"] },
        },
      },
      edges: [{ id: "e", source: "A", target: "B", type: "normal" }],
      entryNodeId: "A",
      ctx: {},
    };
    mount(
      <InputsSection
        config={config}
        nodeId="B"
        onConfigChange={onConfigChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /revert to auto/i }));

    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[0][0];
    expect(next.nodes.B.metadata?.lockedInputPorts ?? []).not.toContain(
      "fileData",
    );
  });
});
