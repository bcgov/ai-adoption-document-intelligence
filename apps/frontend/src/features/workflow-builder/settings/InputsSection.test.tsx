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
  it("shows an auto-bound row with the producer node's label and an 'Auto' pill", () => {
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
    expect(screen.getByText(/pick a source/i)).toBeInTheDocument();
  });

  it("shows a red 'Needs a source' chip when no upstream producer matches", () => {
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
    expect(screen.getByText(/needs a source/i)).toBeInTheDocument();
  });

  it("clicking 'Change source' on an auto row adds the port to lockedInputPorts and stamps the new binding", async () => {
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
    await user.click(screen.getByRole("button", { name: /change source/i }));
    await user.click(screen.getByText("Prepare ALT"));

    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[0][0];
    expect(next.nodes.B.metadata.lockedInputPorts).toContain("fileData");
    expect(next.nodes.B.inputs).toContainEqual({
      port: "fileData",
      ctxKey: "__auto.ALT.preparedData",
    });
  });

  it("does not render a row for OPTIONAL Artifact-kinded identifier ports, but renders required ones", () => {
    // file.prepare has `fileName`, `fileType`, `contentType` (kind
    // "Artifact", optional) which must stay invisible. `documentId` (kind
    // "Artifact", REQUIRED) and `blobKey` (kind "Document", required) both
    // now render as rows (ring/badge reconciliation, PORT_WIRING §4.2).
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
      },
      edges: [],
      entryNodeId: "A",
      ctx: {},
    };
    mount(
      <InputsSection config={config} nodeId="A" onConfigChange={vi.fn()} />,
    );
    // Optional identifier-port labels that must NOT appear
    expect(screen.queryByText("File name")).not.toBeInTheDocument();
    expect(screen.queryByText("File type")).not.toBeInTheDocument();
    expect(screen.queryByText("Content type (MIME)")).not.toBeInTheDocument();
    // The required Document-kinded blobKey port and the required
    // Artifact-kinded documentId port should both be visible (unsatisfied).
    expect(screen.getByText("File reference (blob key)")).toBeInTheDocument();
    expect(screen.getByText("Document ID")).toBeInTheDocument();
  });

  it("renders a row for a REQUIRED base-Artifact identifier port", () => {
    // Previously this row was hidden entirely (row filter only showed
    // shouldAutoWirePort ports). documentId is required and kind "Artifact"
    // so it must now render.
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
      },
      edges: [],
      entryNodeId: "A",
      ctx: {},
    };
    mount(
      <InputsSection config={config} nodeId="A" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText("Document ID")).toBeInTheDocument();
  });

  it("treats an unlocked identifier port bound to a real ctx variable as sourced (parity with the drawer's manuallyBoundPorts filter)", () => {
    // documentId carries a persisted non-auto binding but NO lock — the shape
    // external tools/agents write (e.g. migrate-graph-config-ocr-refs). The
    // resolver ignores unlocked inputs[] rows and reports "unsatisfied", but
    // the drawer suppresses exactly this case: a ctx-bound port HAS a source.
    // The panel must agree — show the binding, not the red button.
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [
            { port: "documentId", ctxKey: "documentId" },
            { port: "blobKey", ctxKey: "blobKey" },
          ],
          // blobKey is locked/bound so documentId is the only port whose
          // rendering is under test.
          metadata: { lockedInputPorts: ["blobKey"] },
        },
      },
      edges: [],
      entryNodeId: "A",
      ctx: {
        documentId: { type: "string", isInput: true },
        blobKey: { type: "string", isInput: true },
      },
    };
    mount(
      <InputsSection config={config} nodeId="A" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText("from documentId")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /change source/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/needs a source/i)).not.toBeInTheDocument();
  });

  it("still shows 'Needs a source' for an unlocked identifier port with no binding at all", () => {
    // Inverse guard: without a persisted binding the port genuinely has no
    // source — the red button must stay.
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
          metadata: { lockedInputPorts: ["blobKey"] },
        },
      },
      edges: [],
      entryNodeId: "A",
      ctx: { blobKey: { type: "string", isInput: true } },
    };
    mount(
      <InputsSection config={config} nodeId="A" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText(/needs a source/i)).toBeInTheDocument();
    // The unbound documentId port must not read as sourced. (blobKey, the
    // locked helper port, legitimately shows "from blobKey" — a pinned row.)
    expect(screen.queryByText("from documentId")).not.toBeInTheDocument();
  });

  it("shows the producer label (not the raw __auto key) for a pinned auto-key row", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare",
          outputs: [
            { port: "preparedData", ctxKey: "__auto.prep.preparedData" },
          ],
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "B",
          inputs: [{ port: "fileData", ctxKey: "__auto.prep.preparedData" }],
          metadata: { lockedInputPorts: ["fileData"] },
        },
      },
      edges: [{ id: "e", source: "prep", target: "B", type: "normal" }],
      entryNodeId: "prep",
      ctx: {},
    };
    mount(
      <InputsSection config={config} nodeId="B" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText("Prepare")).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(
      screen.queryByText("__auto.prep.preparedData"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /revert to automatic/i }),
    ).toBeInTheDocument();
  });

  it("shows 'from <ctxKey>' (no producer arrow) for a pinned NON-auto ctx var", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "B",
          inputs: [{ port: "fileData", ctxKey: "myVar" }],
          metadata: { lockedInputPorts: ["fileData"] },
        },
      },
      edges: [],
      entryNodeId: "B",
      ctx: { myVar: { type: "string", isInput: true } },
    };
    mount(
      <InputsSection config={config} nodeId="B" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText("from myVar")).toBeInTheDocument();
    // Still a pinned row (badge + revert), but never a producer arrow to a
    // node that doesn't exist.
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.queryByText("←")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /revert to automatic/i }),
    ).toBeInTheDocument();
  });

  it("renders a 'Disconnected' badge with Pick-a-source and Revert-to-automatic buttons for a locked-unbound port", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        Z: {
          id: "Z",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Z",
          metadata: { lockedInputPorts: ["fileData"] },
        },
      },
      edges: [],
      entryNodeId: "Z",
      ctx: {},
    };
    mount(
      <InputsSection config={config} nodeId="Z" onConfigChange={vi.fn()} />,
    );
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /pick a source/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /revert to automatic/i }),
    ).toBeInTheDocument();
  });

  it("clicking 'Revert to automatic' removes the port from lockedInputPorts", async () => {
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
    await user.click(
      screen.getByRole("button", { name: /revert to automatic/i }),
    );

    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[0][0];
    expect(next.nodes.B.metadata?.lockedInputPorts ?? []).not.toContain(
      "fileData",
    );
  });

  function ambiguousConfig(): GraphWorkflowConfig {
    return {
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
        { id: "e1", source: "X", target: "Z", type: "normal" },
        { id: "e2", source: "Y", target: "Z", type: "normal" },
      ],
      entryNodeId: "X",
      ctx: {},
    };
  }

  it("opens the source picker for `focusPort` on mount (status-dot deep-link)", () => {
    mount(
      <InputsSection
        config={ambiguousConfig()}
        nodeId="Z"
        onConfigChange={vi.fn()}
        focusPort="fileData"
        onFocusConsumed={vi.fn()}
      />,
    );
    // The picker modal is open, listing both competing producers to choose
    // from — without focusPort it stays collapsed behind the "Pick a source"
    // button (no producer rows rendered).
    expect(screen.getAllByTestId("producer-row-label")).toHaveLength(2);
  });

  it("names the port in the picker modal title", () => {
    mount(
      <InputsSection
        config={ambiguousConfig()}
        nodeId="Z"
        onConfigChange={vi.fn()}
        focusPort="fileData"
        onFocusConsumed={vi.fn()}
      />,
    );
    // fileData's catalog label is "Prepared file data".
    expect(
      screen.getByText('Choose a source for "Prepared file data"'),
    ).toBeInTheDocument();
  });

  it("clears the focus signal (onFocusConsumed) once a producer is picked so it doesn't re-open", async () => {
    const user = userEvent.setup();
    const onFocusConsumed = vi.fn();
    const onConfigChange = vi.fn();
    mount(
      <InputsSection
        config={ambiguousConfig()}
        nodeId="Z"
        onConfigChange={onConfigChange}
        focusPort="fileData"
        onFocusConsumed={onFocusConsumed}
      />,
    );
    // Deep-linked picker is open; pick one of the competing producers.
    await user.click(screen.getAllByTestId("producer-row-label")[0]);
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    expect(onFocusConsumed).toHaveBeenCalledTimes(1);
  });

  it("does not open any picker when focusPort is null", () => {
    mount(
      <InputsSection
        config={ambiguousConfig()}
        nodeId="Z"
        onConfigChange={vi.fn()}
        focusPort={null}
      />,
    );
    expect(screen.queryAllByTestId("producer-row-label")).toHaveLength(0);
  });
});
