import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { InputsSection } from "./InputsSection";

function mount(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Secondary actions (Change source / Revert to automatic) now live behind a
 * per-row `⋯` overflow menu. Open the menu for `portName` and return the
 * menu-item lookups. Mantine renders the dropdown in a portal on open, so the
 * items only exist in the DOM after the trigger is clicked.
 */
async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  portName: string,
) {
  await user.click(screen.getByTestId(`input-row-menu-${portName}`));
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

  it("clicking 'Change source' (in the ⋯ menu) on an auto row adds the port to lockedInputPorts and stamps the new binding", async () => {
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
    await openRowMenu(user, "fileData");
    await user.click(
      await screen.findByRole("menuitem", { name: /change source/i }),
    );
    await user.click(screen.getByText("Prepare ALT"));

    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[0][0];
    expect(next.nodes.B.metadata.lockedInputPorts).toContain("fileData");
    expect(next.nodes.B.inputs).toContainEqual({
      port: "fileData",
      ctxKey: "__auto.ALT.preparedData",
    });
  });

  it("folds OPTIONAL Artifact-kinded identifier ports out of the top-level list, but renders required ones", () => {
    // file.prepare has `fileName`, `fileType`, `contentType` (kind
    // "Artifact", optional), which P-5 moved behind the collapsed disclosure —
    // present, but not on arrival. `documentId` (kind "Artifact", REQUIRED)
    // and `blobKey` (kind "Document", required) both render as rows
    // (ring/badge reconciliation, PORT_WIRING §4.2).
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

  it("treats an unlocked identifier port bound to a real ctx variable as sourced (parity with the drawer's manuallyBoundPorts filter)", async () => {
    const user = userEvent.setup();
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
    expect(screen.queryByText(/needs a source/i)).not.toBeInTheDocument();
    // "Change source" is the row's only (secondary) action → behind the ⋯ menu.
    await openRowMenu(user, "documentId");
    expect(
      await screen.findByRole("menuitem", { name: /change source/i }),
    ).toBeInTheDocument();
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

  it("shows the producer label (not the raw __auto key) for a pinned auto-key row", async () => {
    const user = userEvent.setup();
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
    // Revert lives behind the ⋯ menu now.
    await openRowMenu(user, "fileData");
    expect(
      await screen.findByRole("menuitem", { name: /revert to automatic/i }),
    ).toBeInTheDocument();
  });

  it("shows 'from <ctxKey>' (no producer arrow) for a pinned NON-auto ctx var", async () => {
    const user = userEvent.setup();
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
    await openRowMenu(user, "fileData");
    expect(
      await screen.findByRole("menuitem", { name: /revert to automatic/i }),
    ).toBeInTheDocument();
  });

  it("renders a 'Disconnected' badge with an inline Pick-a-source button and a Revert-to-automatic ⋯ menu item for a locked-unbound port", async () => {
    const user = userEvent.setup();
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
    // Pick a source is the PRIMARY call-to-action and stays inline.
    expect(
      screen.getByRole("button", { name: /pick a source/i }),
    ).toBeInTheDocument();
    // Revert to automatic is SECONDARY → not directly visible, only in the menu.
    expect(
      screen.queryByRole("button", { name: /revert to automatic/i }),
    ).not.toBeInTheDocument();
    await openRowMenu(user, "fileData");
    expect(
      await screen.findByRole("menuitem", { name: /revert to automatic/i }),
    ).toBeInTheDocument();
  });

  it("locked-unbound: inline 'Pick a source' calls onOverride (opens the picker) and does not need the menu", async () => {
    const user = userEvent.setup();
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
    // Clicking the inline primary opens the ProducerPicker modal.
    await user.click(screen.getByRole("button", { name: /pick a source/i }));
    expect(
      screen.getByText('Choose a source for "Prepared file data"'),
    ).toBeInTheDocument();
  });

  it("locked-unbound: the ⋯ 'Revert to automatic' menu item calls onRevert (removes the lock)", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
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
      <InputsSection
        config={config}
        nodeId="Z"
        onConfigChange={onConfigChange}
      />,
    );
    await openRowMenu(user, "fileData");
    await user.click(
      await screen.findByRole("menuitem", { name: /revert to automatic/i }),
    );
    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[0][0];
    expect(next.nodes.Z.metadata?.lockedInputPorts ?? []).not.toContain(
      "fileData",
    );
  });

  it("auto-bound: 'Change source' is in the ⋯ menu and calls onOverride (opens the picker)", async () => {
    const user = userEvent.setup();
    mount(
      <InputsSection
        config={autoBoundConfig()}
        nodeId="B"
        onConfigChange={vi.fn()}
      />,
    );
    // Not inline.
    expect(
      screen.queryByRole("button", { name: /change source/i }),
    ).not.toBeInTheDocument();
    await openRowMenu(user, "fileData");
    await user.click(
      await screen.findByRole("menuitem", { name: /change source/i }),
    );
    // Picker modal opened for the port.
    expect(
      screen.getByText('Choose a source for "Prepared file data"'),
    ).toBeInTheDocument();
  });

  it("locked: the ⋯ menu offers BOTH 'Change source' and 'Revert to automatic'", async () => {
    const user = userEvent.setup();
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
    await openRowMenu(user, "fileData");
    // Capture the whole portaled dropdown in one waiting query (the menu can
    // close under jsdom's focus handling before a second synchronous query).
    const items = (await screen.findAllByRole("menuitem")).map(
      (el) => el.textContent ?? "",
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/change source/i),
        expect.stringMatching(/revert to automatic/i),
      ]),
    );
  });

  it("ambiguous and unsatisfied rows expose only the inline primary button — no ⋯ menu", () => {
    // ambiguous → Pick a source (inline), unsatisfied → Needs a source (inline).
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
        // Ambiguous consumer: two equidistant producers compete for fileData.
        Z: {
          id: "Z",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Z",
        },
        // Unsatisfied consumer: no upstream producer at all.
        U: {
          id: "U",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "U",
        },
      },
      edges: [
        { id: "e0", source: "X", target: "Z", type: "normal" },
        { id: "e1", source: "Y", target: "Z", type: "normal" },
      ],
      entryNodeId: "X",
      ctx: {},
    };
    // Ambiguous Z: inline Pick a source, no menu trigger.
    const { unmount } = mount(
      <InputsSection config={config} nodeId="Z" onConfigChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /pick a source/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("input-row-menu-fileData")).toBeNull();
    unmount();

    // Unsatisfied U: inline Needs a source, no menu trigger.
    mount(
      <InputsSection config={config} nodeId="U" onConfigChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /needs a source/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("input-row-menu-fileData")).toBeNull();
  });

  it("clicking 'Revert to automatic' (in the ⋯ menu) removes the port from lockedInputPorts", async () => {
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
    await openRowMenu(user, "fileData");
    await user.click(
      await screen.findByRole("menuitem", { name: /revert to automatic/i }),
    );

    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[0][0];
    expect(next.nodes.B.metadata?.lockedInputPorts ?? []).not.toContain(
      "fileData",
    );
  });

  it("reserves a trailing action slot on every row (menu-less unsatisfied rows and a menu-bearing auto-bound row alike) so columns line up", () => {
    // file.prepare has two REQUIRED identifier ports (blobKey, documentId)
    // that render as unsatisfied rows. Each must carry the trailing action
    // slot — even though neither has a ⋯ menu — so the label / status / action
    // columns stay aligned down the panel.
    const prepConfig: GraphWorkflowConfig = {
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
    const { unmount } = mount(
      <InputsSection config={prepConfig} nodeId="A" onConfigChange={vi.fn()} />,
    );
    // Both unsatisfied rows reserve the trailing slot; neither has a menu.
    expect(screen.getByTestId("input-row-actions-blobKey")).toBeInTheDocument();
    expect(screen.queryByTestId("input-row-menu-blobKey")).toBeNull();
    expect(
      screen.getByTestId("input-row-actions-documentId"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("input-row-menu-documentId")).toBeNull();
    unmount();

    // An auto-bound row reserves the SAME trailing slot, this time holding a
    // ⋯ menu — proving with-menu and without-menu rows share the slot.
    mount(
      <InputsSection
        config={autoBoundConfig()}
        nodeId="B"
        onConfigChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("input-row-actions-fileData"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("input-row-menu-fileData")).toBeInTheDocument();
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

  // -------------------------------------------------------------------------
  // Item 6X — real-producer rows are interactive (jump on click, highlight on
  // hover); rows with no real producer are not.
  // -------------------------------------------------------------------------

  function autoBoundConfig(): GraphWorkflowConfig {
    return {
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
  }

  it("an auto-bound row jumps to the producer on click and highlights it on hover/leave", async () => {
    const user = userEvent.setup();
    const onJumpToProducer = vi.fn();
    const onHoverProducer = vi.fn();
    mount(
      <InputsSection
        config={autoBoundConfig()}
        nodeId="B"
        onConfigChange={vi.fn()}
        onJumpToProducer={onJumpToProducer}
        onHoverProducer={onHoverProducer}
      />,
    );
    const row = screen.getByTestId("input-producer-row-fileData");
    await user.hover(row);
    expect(onHoverProducer).toHaveBeenLastCalledWith("A");
    await user.unhover(row);
    expect(onHoverProducer).toHaveBeenLastCalledWith(null);
    await user.click(row);
    expect(onJumpToProducer).toHaveBeenCalledWith("A");
  });

  it("opening the auto-bound row's ⋯ menu and clicking 'Change source' does NOT jump to the producer", async () => {
    const user = userEvent.setup();
    const onJumpToProducer = vi.fn();
    mount(
      <InputsSection
        config={autoBoundConfig()}
        nodeId="B"
        onConfigChange={vi.fn()}
        onJumpToProducer={onJumpToProducer}
      />,
    );
    // Opening the ⋯ menu (a click inside the row) must not fire the row-jump.
    await openRowMenu(user, "fileData");
    expect(onJumpToProducer).not.toHaveBeenCalled();
    // Nor does clicking the portaled menu item.
    await user.click(
      await screen.findByRole("menuitem", { name: /change source/i }),
    );
    expect(onJumpToProducer).not.toHaveBeenCalled();
  });

  it("a locked row bound to an __auto key jumps to the decoded producer", async () => {
    const user = userEvent.setup();
    const onJumpToProducer = vi.fn();
    const onHoverProducer = vi.fn();
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
      <InputsSection
        config={config}
        nodeId="B"
        onConfigChange={vi.fn()}
        onJumpToProducer={onJumpToProducer}
        onHoverProducer={onHoverProducer}
      />,
    );
    const row = screen.getByTestId("input-producer-row-fileData");
    await user.click(row);
    expect(onJumpToProducer).toHaveBeenCalledWith("prep");
    await user.hover(row);
    expect(onHoverProducer).toHaveBeenLastCalledWith("prep");
  });

  it("an unsatisfied row is NOT interactive (no jump/hover, no interactive row)", async () => {
    const user = userEvent.setup();
    const onJumpToProducer = vi.fn();
    const onHoverProducer = vi.fn();
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
      <InputsSection
        config={config}
        nodeId="Z"
        onConfigChange={vi.fn()}
        onJumpToProducer={onJumpToProducer}
        onHoverProducer={onHoverProducer}
      />,
    );
    // No interactive producer row rendered.
    expect(screen.queryByTestId("input-producer-row-fileData")).toBeNull();
    // Clicking the "Needs a source" affordance never triggers a jump/hover.
    await user.click(screen.getByRole("button", { name: /needs a source/i }));
    expect(onJumpToProducer).not.toHaveBeenCalled();
    expect(onHoverProducer).not.toHaveBeenCalled();
  });

  it("a ctx-bound (non-auto) row is NOT interactive", () => {
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
      <InputsSection
        config={config}
        nodeId="A"
        onConfigChange={vi.fn()}
        onJumpToProducer={vi.fn()}
        onHoverProducer={vi.fn()}
      />,
    );
    // The ctx-bound documentId row shows "from documentId" but is not a
    // jump/highlight target (no producer node).
    expect(screen.getByText("from documentId")).toBeInTheDocument();
    expect(screen.queryByTestId("input-producer-row-documentId")).toBeNull();
  });

  it("a locked row bound to a hand-authored (non-auto) ctx var is NOT interactive", () => {
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
      <InputsSection
        config={config}
        nodeId="B"
        onConfigChange={vi.fn()}
        onJumpToProducer={vi.fn()}
        onHoverProducer={vi.fn()}
      />,
    );
    expect(screen.getByText("from myVar")).toBeInTheDocument();
    expect(screen.queryByTestId("input-producer-row-fileData")).toBeNull();
  });
});

/**
 * G-046 — every optional base-`Artifact` identifier port (26 across the
 * catalog) owns an `in-<port>` canvas handle a user can drag onto, while the
 * Inputs panel hid it. A binding made by dragging was therefore invisible to
 * the panel, the badge and the drawer, with no way to see or undo it short of
 * the raw advanced-bindings editor.
 *
 * A port that HOLDS something is a top-level row. P-5 changed what happens to
 * the rest: they are no longer absent, they are FOLDED behind the collapsed
 * "N optional inputs" disclosure — so the panel is still short on arrival
 * (`file.prepare` alone has three) without the card advertising a port the
 * panel denies. These cases assert the top-level list; the disclosure has its
 * own block below.
 */
describe("InputsSection — G-046 bound optional identifier ports", () => {
  function filePrepare(
    inputs?: Array<{ port: string; ctxKey: string }>,
  ): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          ...(inputs ? { inputs } : {}),
        },
      },
      edges: [],
      entryNodeId: "A",
      ctx: { uploadName: { type: "string", isInput: true } },
    } as GraphWorkflowConfig;
  }

  it("keeps an UNBOUND optional identifier port out of the top-level list", () => {
    mount(
      <InputsSection
        config={filePrepare()}
        nodeId="A"
        onConfigChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("File name")).not.toBeInTheDocument();
  });

  it("shows one the author bound by dragging onto its canvas handle", () => {
    mount(
      <InputsSection
        config={filePrepare([{ port: "fileName", ctxKey: "uploadName" }])}
        nodeId="A"
        onConfigChange={vi.fn()}
      />,
    );
    expect(screen.getByText("File name")).toBeInTheDocument();
  });

  it("leaves its siblings folded — only the bound one appears at the top level", () => {
    mount(
      <InputsSection
        config={filePrepare([{ port: "fileName", ctxKey: "uploadName" }])}
        nodeId="A"
        onConfigChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("File type")).not.toBeInTheDocument();
    expect(screen.queryByText("Content type (MIME)")).not.toBeInTheDocument();
  });

  it("does not count an empty ctxKey as bound", () => {
    // A ctxKey-less input stub can slip into the in-memory config on an edge
    // delete; it is not a binding and must not surface a row.
    mount(
      <InputsSection
        config={filePrepare([{ port: "fileName", ctxKey: "" }])}
        nodeId="A"
        onConfigChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("File name")).not.toBeInTheDocument();
  });
});

/**
 * P-5 — constants on input rows (ruling R-3).
 *
 * Three surfaces, in the order they were built: the collapsed disclosure that
 * makes optional identifier ports reachable at all, the inline value field
 * that writes a hidden ctx entry, and the promotion that turns that entry into
 * a named workflow input.
 */
describe("InputsSection — port constants (P-5)", () => {
  function filePrepareNode(
    overrides: Partial<GraphWorkflowConfig> = {},
  ): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare",
        },
      },
      edges: [],
      entryNodeId: "A",
      ctx: {},
      ...overrides,
    } as GraphWorkflowConfig;
  }

  it("offers the optional ports behind a collapsed 'N optional inputs' disclosure", async () => {
    const user = userEvent.setup();
    mount(
      <InputsSection
        config={filePrepareNode()}
        nodeId="A"
        onConfigChange={vi.fn()}
      />,
    );
    // Folded on arrival: the count is visible, the rows are not.
    expect(screen.getByText("3 optional inputs")).toBeInTheDocument();
    expect(screen.queryByTestId("optional-inputs-list")).toBeNull();

    await user.click(screen.getByTestId("optional-inputs-toggle"));
    expect(screen.getByTestId("optional-inputs-list")).toBeInTheDocument();
    expect(screen.getByText("File type")).toBeInTheDocument();
  });

  it("gives an optional row a value field placeholdered with its auto-detect note, and no red 'needs a source'", async () => {
    const user = userEvent.setup();
    mount(
      <InputsSection
        config={filePrepareNode()}
        nodeId="A"
        onConfigChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId("optional-inputs-toggle"));
    const field = screen.getByTestId("input-constant-fileType");
    expect(field).toHaveValue("");
    expect(field.getAttribute("placeholder")).toContain("Auto-detected");
    // The badge and the validation drawer both decline to count optional
    // identifier ports; the panel must not be the one surface calling them
    // broken.
    expect(
      within(screen.getByTestId("input-row-actions-fileType")).queryByText(
        /needs a source/i,
      ),
    ).toBeNull();
  });

  it("typing a value and blurring writes a hidden ctx entry with defaultValue and binds the port", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    mount(
      <InputsSection
        config={filePrepareNode()}
        nodeId="A"
        onConfigChange={onConfigChange}
      />,
    );
    await user.click(screen.getByTestId("optional-inputs-toggle"));
    await user.type(screen.getByTestId("input-constant-fileType"), "image");
    // Commit is on blur, not per keystroke — one undo step, not five.
    expect(onConfigChange).not.toHaveBeenCalled();
    await user.tab();

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    const [ctxKey, declaration] = Object.entries(next.ctx)[0];
    expect(ctxKey.startsWith("__const_")).toBe(true);
    expect(ctxKey).not.toContain(".");
    expect(declaration.defaultValue).toBe("image");
    expect(next.nodes.A.inputs).toEqual([{ port: "fileType", ctxKey }]);
  });

  it("a row holding a constant reads as a Value at the top level, not as a pin to a __const key", () => {
    const config = filePrepareNode({
      ctx: { __const_A_fileType: { type: "string", defaultValue: "image" } },
    });
    config.nodes.A.inputs = [
      { port: "fileType", ctxKey: "__const_A_fileType" },
    ];
    config.nodes.A.metadata = { lockedInputPorts: ["fileType"] };
    mount(
      <InputsSection config={config} nodeId="A" onConfigChange={vi.fn()} />,
    );
    // Top level, not behind the disclosure: it holds something.
    expect(screen.getByText("File type")).toBeInTheDocument();
    expect(screen.getByText("2 optional inputs")).toBeInTheDocument();
    expect(screen.getByTestId("input-constant-fileType")).toHaveValue("image");
    expect(screen.queryByText(/__const_A_fileType/)).toBeNull();
  });

  it("emptying the field removes the constant, the binding and the lock", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    const config = filePrepareNode({
      ctx: { __const_A_fileType: { type: "string", defaultValue: "image" } },
    });
    config.nodes.A.inputs = [
      { port: "fileType", ctxKey: "__const_A_fileType" },
    ];
    config.nodes.A.metadata = { lockedInputPorts: ["fileType"] };
    mount(
      <InputsSection
        config={config}
        nodeId="A"
        onConfigChange={onConfigChange}
      />,
    );
    await user.clear(screen.getByTestId("input-constant-fileType"));
    await user.tab();

    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.ctx).toEqual({});
    expect(next.nodes.A.inputs).toEqual([]);
    expect(next.nodes.A.metadata?.lockedInputPorts).toBeUndefined();
  });

  it("promotes a constant into a named workflow input with isInput and the value as its default", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    const config = filePrepareNode({
      ctx: { __const_A_fileType: { type: "string", defaultValue: "image" } },
    });
    config.nodes.A.inputs = [
      { port: "fileType", ctxKey: "__const_A_fileType" },
    ];
    config.nodes.A.metadata = { lockedInputPorts: ["fileType"] };
    mount(
      <InputsSection
        config={config}
        nodeId="A"
        onConfigChange={onConfigChange}
      />,
    );
    await openRowMenu(user, "fileType");
    await user.click(
      await screen.findByTestId("input-row-menu-fileType-promote"),
    );
    // Pre-filled with the port name; confirm as-is.
    expect(screen.getByTestId("promote-constant-name")).toHaveValue("fileType");
    await user.click(screen.getByTestId("promote-constant-confirm"));

    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.ctx).toEqual({
      fileType: { type: "string", defaultValue: "image", isInput: true },
    });
    expect(next.nodes.A.inputs).toEqual([
      { port: "fileType", ctxKey: "fileType" },
    ]);
  });

  it("refuses to promote onto a name that is already declared", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    const config = filePrepareNode({
      ctx: {
        __const_A_fileType: { type: "string", defaultValue: "image" },
        fileType: { type: "string" },
      },
    });
    config.nodes.A.inputs = [
      { port: "fileType", ctxKey: "__const_A_fileType" },
    ];
    config.nodes.A.metadata = { lockedInputPorts: ["fileType"] };
    mount(
      <InputsSection
        config={config}
        nodeId="A"
        onConfigChange={onConfigChange}
      />,
    );
    await openRowMenu(user, "fileType");
    await user.click(
      await screen.findByTestId("input-row-menu-fileType-promote"),
    );
    expect(screen.getByText(/already declared/)).toBeInTheDocument();
    expect(screen.getByTestId("promote-constant-confirm")).toBeDisabled();
    expect(onConfigChange).not.toHaveBeenCalled();
  });
});
