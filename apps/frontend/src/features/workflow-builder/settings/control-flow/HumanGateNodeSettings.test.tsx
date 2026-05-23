/**
 * Tests for HumanGateNodeSettings (US-009).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-009-human-gate-node-settings.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
  HumanGateNode,
} from "../../../../types/workflow";
import { HumanGateNodeSettings } from "./HumanGateNodeSettings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  nodes: GraphNode[],
  edges: GraphEdge[] = [],
): GraphWorkflowConfig {
  const nodesRecord: Record<string, GraphNode> = {};
  for (const node of nodes) {
    nodesRecord[node.id] = node;
  }
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: nodesRecord,
    edges,
    ctx: {},
  };
}

const activity = (id: string, label: string): ActivityNode => ({
  id,
  type: "activity",
  label,
  activityType: "test.noop",
});

const edge = (
  id: string,
  source: string,
  target: string,
  type: GraphEdge["type"] = "normal",
): GraphEdge => ({
  id,
  source,
  target,
  type,
});

function humanGateNode(
  id: string,
  label: string,
  overrides: Partial<HumanGateNode> = {},
): HumanGateNode {
  return {
    id,
    type: "humanGate",
    label,
    signal: { name: "approve" },
    timeout: "1h",
    onTimeout: "fail",
    ...overrides,
  };
}

function renderSettings(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Convenience wrapper so a test can mount the form once, then poke at the
 * latest `onConfigChange` payload via the spy while the form stays in sync
 * with the most recent value.
 */
function mountWithSpy(
  initialConfig: GraphWorkflowConfig,
  humanGateNodeId: string,
) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    const node = config.nodes[humanGateNodeId] as HumanGateNode;
    return (
      <HumanGateNodeSettings
        node={node}
        config={config}
        onConfigChange={(next) => {
          spy(next);
          setConfig(next);
        }}
      />
    );
  }

  const utils = renderSettings(<Wrapper />);
  return { ...utils, spy };
}

// ---------------------------------------------------------------------------
// Scenario 1: signal.name is a required TextInput
// ---------------------------------------------------------------------------

describe("HumanGateNodeSettings — Scenario 1: signal.name is a required TextInput", () => {
  it("typing a signal name fires onConfigChange with signal.name updated; an empty value shows an inline required-field error", () => {
    const initial = humanGateNode("hg1", "Approve gate", {
      signal: { name: "" },
    });
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "hg1");

    const signalInput = screen.getByTestId(
      "human-gate-node-settings-signal-name",
    ) as HTMLInputElement;

    // Empty value surfaces an inline required-field error.
    expect(signalInput).toHaveAttribute("aria-invalid", "true");

    // Type a name → propagates via onConfigChange with signal.name updated.
    fireEvent.change(signalInput, { target: { value: "approve-doc" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.hg1 as HumanGateNode;
    expect(updated.signal.name).toBe("approve-doc");

    // Once a name is present, the error clears.
    expect(signalInput).toHaveAttribute("aria-invalid", "false");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: signal.payloadSchema renders as read-only JSON preview
// ---------------------------------------------------------------------------

describe("HumanGateNodeSettings — Scenario 2: signal.payloadSchema is read-only", () => {
  it("renders the payloadSchema as JSON and shows an advisory hint about V2 schema authoring", () => {
    const payloadSchema = {
      type: "object",
      properties: {
        approver: { type: "string" },
        notes: { type: "string" },
      },
    };
    const initial = humanGateNode("hg1", "Approve gate", {
      signal: { name: "approve", payloadSchema },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <HumanGateNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    // The payload schema block is rendered.
    const schemaBlock = screen.getByTestId(
      "human-gate-node-settings-payload-schema",
    );
    expect(schemaBlock).toBeInTheDocument();

    // The schema is shown as a JSON preview matching the serialized value.
    const preview = within(schemaBlock).getByTestId(
      "human-gate-node-settings-payload-schema-preview",
    );
    expect(preview.textContent).toBe(JSON.stringify(payloadSchema, null, 2));

    // The advisory hint about V2 schema authoring is present.
    expect(
      within(schemaBlock).getByText(/not yet supported in V2/i),
    ).toBeInTheDocument();
  });

  it("omits the payload schema block when no payloadSchema is set", () => {
    const initial = humanGateNode("hg1", "Approve gate");
    const config = makeConfig([initial]);

    renderSettings(
      <HumanGateNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    expect(
      screen.queryByTestId("human-gate-node-settings-payload-schema"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: timeout is a required TextInput validated as Temporal duration
// ---------------------------------------------------------------------------

describe("HumanGateNodeSettings — Scenario 3: timeout is validated as a Temporal duration", () => {
  it("'1h' commits; empty and 'abc' show inline errors and are not propagated", () => {
    const initial = humanGateNode("hg1", "Approve gate", { timeout: "30s" });
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "hg1");

    const timeoutInput = screen.getByTestId(
      "human-gate-node-settings-timeout",
    ) as HTMLInputElement;

    // ── 1) '1h' is accepted and propagated. ──────────────────────────────
    fireEvent.change(timeoutInput, { target: { value: "1h" } });
    const after1h = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect((after1h.nodes.hg1 as HumanGateNode).timeout).toBe("1h");
    const callCountAfter1h = spy.mock.calls.length;
    expect(timeoutInput).toHaveAttribute("aria-invalid", "false");

    // ── 2) Empty value is rejected — no new onConfigChange, inline error. ─
    fireEvent.change(timeoutInput, { target: { value: "" } });
    expect(spy.mock.calls.length).toBe(callCountAfter1h);
    const stillAt1h = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect((stillAt1h.nodes.hg1 as HumanGateNode).timeout).toBe("1h");
    expect(timeoutInput).toHaveAttribute("aria-invalid", "true");

    // ── 3) 'abc' is rejected — no new onConfigChange, inline error. ──────
    fireEvent.change(timeoutInput, { target: { value: "abc" } });
    expect(spy.mock.calls.length).toBe(callCountAfter1h);
    const stillAt1hAgain = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect((stillAt1hAgain.nodes.hg1 as HumanGateNode).timeout).toBe("1h");
    expect(timeoutInput).toHaveAttribute("aria-invalid", "true");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: onTimeout is a SegmentedControl with fail/continue/fallback
// ---------------------------------------------------------------------------

describe("HumanGateNodeSettings — Scenario 4: onTimeout SegmentedControl", () => {
  it("clicking each segment in turn fires onConfigChange with the matching value", () => {
    const initial = humanGateNode("hg1", "Approve gate", { onTimeout: "fail" });
    const config = makeConfig(
      [initial, activity("n2", "Skip")],
      [edge("e1", "hg1", "n2")],
    );

    const { spy } = mountWithSpy(config, "hg1");

    const segmented = screen.getByTestId("human-gate-node-settings-on-timeout");

    // Click the "Continue" segment.
    const continueSegment = within(segmented).getByDisplayValue("continue");
    fireEvent.click(continueSegment);
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.hg1 as HumanGateNode;
      expect(updated.onTimeout).toBe("continue");
    }

    // Click the "Fallback" segment.
    const fallbackSegment = within(segmented).getByDisplayValue("fallback");
    fireEvent.click(fallbackSegment);
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.hg1 as HumanGateNode;
      expect(updated.onTimeout).toBe("fallback");
    }

    // Click the "Fail" segment.
    const failSegment = within(segmented).getByDisplayValue("fail");
    fireEvent.click(failSegment);
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.hg1 as HumanGateNode;
      expect(updated.onTimeout).toBe("fail");
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: fallbackEdgeId EdgePicker only appears when onTimeout==="fallback"
// ---------------------------------------------------------------------------

describe("HumanGateNodeSettings — Scenario 5: fallbackEdgeId EdgePicker is conditional", () => {
  it("the EdgePicker appears only when onTimeout==='fallback'; switching back hides it again and drops fallbackEdgeId", () => {
    const initial = humanGateNode("hg1", "Approve gate", { onTimeout: "fail" });
    const config = makeConfig(
      [initial, activity("n2", "Skip")],
      [edge("e1", "hg1", "n2")],
    );

    const { spy } = mountWithSpy(config, "hg1");

    // Initially: onTimeout === "fail", no EdgePicker rendered.
    expect(
      screen.queryByTestId("human-gate-node-settings-fallback-edge"),
    ).not.toBeInTheDocument();

    // Switch onTimeout → "fallback". EdgePicker appears.
    const segmented = screen.getByTestId("human-gate-node-settings-on-timeout");
    const fallbackSegment = within(segmented).getByDisplayValue("fallback");
    fireEvent.click(fallbackSegment);

    const edgePicker = screen.getByTestId(
      "human-gate-node-settings-fallback-edge",
    );
    expect(edgePicker).toBeInTheDocument();

    // Pick the available edge from the picker.
    fireEvent.click(edgePicker);
    const option = screen.getByRole("option", { name: /Skip/ });
    fireEvent.click(option);

    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.hg1 as HumanGateNode;
      expect(updated.onTimeout).toBe("fallback");
      expect(updated.fallbackEdgeId).toBe("e1");
    }

    // Switch onTimeout back to "fail". EdgePicker hides, fallbackEdgeId
    // is dropped from the emitted node.
    const failSegment = within(segmented).getByDisplayValue("fail");
    fireEvent.click(failSegment);

    expect(
      screen.queryByTestId("human-gate-node-settings-fallback-edge"),
    ).not.toBeInTheDocument();
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.hg1 as HumanGateNode;
      expect(updated.onTimeout).toBe("fail");
      expect(updated.fallbackEdgeId).toBeUndefined();
      // Confirm the field is absent (not just undefined) on the emitted node.
      expect("fallbackEdgeId" in updated).toBe(false);
    }

    // Switch onTimeout → "continue". EdgePicker still hidden.
    const continueSegment = within(segmented).getByDisplayValue("continue");
    fireEvent.click(continueSegment);

    expect(
      screen.queryByTestId("human-gate-node-settings-fallback-edge"),
    ).not.toBeInTheDocument();
    {
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updated = next.nodes.hg1 as HumanGateNode;
      expect(updated.onTimeout).toBe("continue");
      expect(updated.fallbackEdgeId).toBeUndefined();
    }
  });
});
