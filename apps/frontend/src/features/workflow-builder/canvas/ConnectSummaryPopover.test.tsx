/**
 * Tests for `ConnectSummaryPopover` (PORT_WIRING_DESIGN.md §6.4).
 *
 * A transient popover shown on the target of a NODE-LEVEL connect (drag
 * node-to-node, hover-extend pick, §6.1 fall-throughs) that narrates what
 * auto-wire did to the target's input bindings. Row semantics mirror
 * `InputsSection` exactly via the shared `resolveWireableInputRows` module
 * — see `input-row-resolution.ts`.
 */
import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import { ConnectSummaryPopover } from "./ConnectSummaryPopover";

function mount(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function baseConfig(
  nodes: GraphWorkflowConfig["nodes"],
  edges: GraphWorkflowConfig["edges"] = [],
  ctx: GraphWorkflowConfig["ctx"] = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges,
    entryNodeId: Object.keys(nodes)[0],
    ctx,
  };
}

describe("ConnectSummaryPopover", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists a check row with the producer's label for each auto-bound input, mentioning name-match", () => {
    // apimRequestId is a REQUIRED base-Artifact identifier port on
    // azureOcr.extract — it only ever auto-binds via name-match (see
    // resolve-input-port.ts's Artifact-kind branch).
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit A",
      outputs: [
        { port: "apimRequestId", ctxKey: "__auto.submit.apimRequestId" },
      ],
    };
    const extract: ActivityNode = {
      id: "extract",
      type: "activity",
      activityType: "azureOcr.extract",
      label: "Extract",
    };
    const config = baseConfig({ submit, extract }, [
      { id: "e", source: "submit", target: "extract", type: "normal" },
    ]);
    mount(
      <ConnectSummaryPopover
        opened
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="extract"
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByTestId("connect-summary-row-apimRequestId");
    expect(row).toHaveTextContent("APIM request ID");
    expect(row).toHaveTextContent("Submit A");
    expect(row).toHaveTextContent(/name/i);
  });

  it("lists a pinned row for locked inputs with a binding", () => {
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit A",
      inputs: [{ port: "fileData", ctxKey: "manualDoc" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const config = baseConfig({ submit }, [], {
      manualDoc: { type: "string", isInput: true },
    });
    mount(
      <ConnectSummaryPopover
        opened
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="submit"
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByTestId("connect-summary-row-fileData");
    expect(row).toHaveTextContent("Prepared file data");
    expect(row).toHaveTextContent(/pinned by you/i);
  });

  it("lists a from-variable row for ctx-bound inputs", () => {
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit A",
      inputs: [{ port: "fileData", ctxKey: "myCtxVar" }],
    };
    const config = baseConfig({ submit }, [], {
      myCtxVar: { type: "string", isInput: true },
    });
    mount(
      <ConnectSummaryPopover
        opened
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="submit"
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByTestId("connect-summary-row-fileData");
    expect(row).toHaveTextContent("from myCtxVar");
  });

  it("lists a warning row with a Fix button for unsatisfied inputs; Fix fires onFix(nodeId, port) and onClose", () => {
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit A",
    };
    const config = baseConfig({ submit });
    const onFix = vi.fn();
    const onClose = vi.fn();
    mount(
      <ConnectSummaryPopover
        opened
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="submit"
        onClose={onClose}
        onFix={onFix}
      />,
    );
    const row = screen.getByTestId("connect-summary-row-fileData");
    expect(row).toHaveTextContent(/needs a source/i);
    fireEvent.click(screen.getByTestId("connect-summary-fix-fileData"));
    expect(onFix).toHaveBeenCalledWith("submit", "fileData");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a 'multiple possible sources' warning row for ambiguous inputs", () => {
    const x: ActivityNode = {
      id: "x",
      type: "activity",
      activityType: "file.prepare",
      label: "Prepare X",
    };
    const y: ActivityNode = {
      id: "y",
      type: "activity",
      activityType: "file.prepare",
      label: "Prepare Y",
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit",
    };
    const config = baseConfig({ x, y, submit }, [
      { id: "e1", source: "x", target: "submit", type: "normal" },
      { id: "e2", source: "y", target: "submit", type: "normal" },
    ]);
    mount(
      <ConnectSummaryPopover
        opened
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="submit"
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByTestId("connect-summary-row-fileData");
    expect(row).toHaveTextContent(/multiple possible sources/i);
    expect(
      screen.getByTestId("connect-summary-fix-fileData"),
    ).toBeInTheDocument();
  });

  it("shows a 'disconnected by you' warning row for locked-unbound inputs", () => {
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit",
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const config = baseConfig({ submit });
    mount(
      <ConnectSummaryPopover
        opened
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="submit"
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByTestId("connect-summary-row-fileData");
    expect(row).toHaveTextContent(/disconnected by you/i);
    expect(
      screen.getByTestId("connect-summary-fix-fileData"),
    ).toBeInTheDocument();
  });

  it("renders nothing (null) for a node with no wireable inputs", () => {
    const noEntry: ActivityNode = {
      id: "n",
      type: "activity",
      // No catalog entry for this made-up activityType — zero wireable rows.
      activityType: "no.such.activity",
      label: "N",
    };
    const config = baseConfig({ n: noEntry });
    mount(
      <ConnectSummaryPopover
        opened
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="n"
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("connect-summary-anchor"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("connect-summary-popover"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when opened is false", () => {
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit",
    };
    const config = baseConfig({ submit });
    mount(
      <ConnectSummaryPopover
        opened={false}
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="submit"
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("connect-summary-popover"),
    ).not.toBeInTheDocument();
  });

  it("uses the connect-summary-popover / connect-summary-row-<port> / connect-summary-fix-<port> testids", () => {
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit",
    };
    const config = baseConfig({ submit });
    mount(
      <ConnectSummaryPopover
        opened
        anchorPosition={{ x: 0, y: 0 }}
        config={config}
        nodeId="submit"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("connect-summary-popover")).toBeInTheDocument();
    expect(
      screen.getByTestId("connect-summary-row-fileData"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("connect-summary-fix-fileData"),
    ).toBeInTheDocument();
  });

  it("auto-dismisses after 8 seconds", () => {
    vi.useFakeTimers();
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit",
    };
    const config = baseConfig({ submit });
    const onCloseSpy = vi.fn();
    // Stateful wrapper — the popover is controlled, so a real host must
    // flip `opened` to false once `onClose` fires for it to actually
    // disappear from the DOM.
    function Harness() {
      const [opened, setOpened] = useState(true);
      const onClose = () => {
        onCloseSpy();
        setOpened(false);
      };
      return (
        <ConnectSummaryPopover
          opened={opened}
          anchorPosition={{ x: 0, y: 0 }}
          config={config}
          nodeId="submit"
          onClose={onClose}
        />
      );
    }
    mount(<Harness />);
    expect(screen.getByTestId("connect-summary-popover")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("connect-summary-popover"),
    ).not.toBeInTheDocument();
  });

  it("does not re-arm the 8s timer when onClose changes identity mid-countdown", () => {
    // Regression guard: the canvas passes `onClose` as an inline closure —
    // a NEW function identity on every canvas re-render (handle hover,
    // selection, drag, config change). If the dismiss effect keys on
    // `onClose`, each re-render clears + re-arms the full 8s and the
    // popover never dismisses while the user interacts with the canvas.
    // Dismissal must fire 8s from OPEN, not 8s from the last re-render.
    vi.useFakeTimers();
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit",
    };
    const config = baseConfig({ submit });
    const onCloseSpy = vi.fn();
    const renderPopover = () => (
      <MantineProvider>
        <ConnectSummaryPopover
          opened
          anchorPosition={{ x: 0, y: 0 }}
          config={config}
          // Fresh inline closure each call — mirrors the canvas's
          // `onClose={() => setConnectSummary(null)}`.
          nodeId="submit"
          onClose={() => onCloseSpy()}
        />
      </MantineProvider>
    );
    const { rerender } = render(renderPopover());
    expect(screen.getByTestId("connect-summary-popover")).toBeInTheDocument();

    // t=4s: simulate a canvas re-render that hands down a NEW onClose.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    rerender(renderPopover());
    expect(onCloseSpy).not.toHaveBeenCalled();

    // t=8s from OPEN (4s after the identity churn): must dismiss now —
    // a re-armed timer would only fire at t=12s.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });
});
