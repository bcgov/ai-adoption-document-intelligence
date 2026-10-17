/**
 * Tests for ErrorPolicySection (G-001 — error handling becomes authorable).
 *
 * The engine has always honoured `errorPolicy`
 * (`apps/temporal/src/graph-engine/error-handling.ts`), the validator has
 * always enforced `fallback ⇒ fallbackEdgeId`, and the canvas has always
 * rendered the bottom `error` handle when the policy asks for it. The one
 * missing piece was a way for an author to set the policy at all.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import { ErrorPolicySection } from "./ErrorPolicySection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  nodes: GraphNode[],
  edges: GraphEdge[] = [],
): GraphWorkflowConfig {
  const nodesRecord: Record<string, GraphNode> = {};
  for (const node of nodes) nodesRecord[node.id] = node;
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: nodesRecord,
    edges,
    ctx: {},
  };
}

function activity(
  id: string,
  overrides: Partial<ActivityNode> = {},
): ActivityNode {
  return {
    id,
    type: "activity",
    label: id,
    activityType: "file.prepare",
    ...overrides,
  };
}

function mountWithSpy(initialConfig: GraphWorkflowConfig, nodeId: string) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();
  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    return (
      <ErrorPolicySection
        node={config.nodes[nodeId]}
        config={config}
        onConfigChange={(next) => {
          spy(next);
          setConfig(next);
        }}
      />
    );
  }
  const utils = render(
    <MantineProvider>
      <Wrapper />
    </MantineProvider>,
  );
  return { ...utils, spy };
}

/** The node from the most recent onConfigChange payload. */
function latestNode(
  spy: ReturnType<typeof vi.fn>,
  nodeId: string,
): GraphNode | undefined {
  const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig | undefined;
  return next?.nodes[nodeId];
}

/**
 * Pick one of the three outcomes by its visible, user-facing label. Goes
 * through the labelled radio input rather than clicking the label text, so
 * the assertion exercises the same control a keyboard user would reach.
 */
function chooseOnError(label: string) {
  fireEvent.click(screen.getByLabelText(label));
}

// ---------------------------------------------------------------------------

describe("ErrorPolicySection", () => {
  it("renders no error-handling section for a node with no errorPolicy, and offers to add one", () => {
    const config = makeConfig([activity("a1")]);
    const { spy } = mountWithSpy(config, "a1");

    // No controls yet — an unset policy is a real state ("behave as the
    // engine does by default"), not a half-filled form.
    expect(screen.queryByTestId("error-policy-on-error")).toBeNull();

    const add = screen.getByTestId("error-policy-add");
    fireEvent.click(add);

    // The added default must match what the engine already does with no
    // policy at all: fail, and leave the failure retryable.
    expect(latestNode(spy, "a1")?.errorPolicy).toEqual({
      onError: "fail",
      retryable: true,
    });
    expect(screen.getByTestId("error-policy-on-error")).toBeInTheDocument();
  });

  it("never shows the author the raw engine values", () => {
    const config = makeConfig([
      activity("a1", { errorPolicy: { onError: "fail", retryable: true } }),
    ]);
    mountWithSpy(config, "a1");
    const section = screen.getByTestId("error-policy-section");
    expect(section.textContent).toContain("Stop the workflow");
    expect(section.textContent).toContain("Follow the error path");
    expect(section.textContent).toContain("Skip this step and continue");
    expect(section.textContent).not.toMatch(/\bfallback\b/);
    expect(section.textContent).not.toMatch(/\bskip\b/);
  });

  it("presents the three outcomes as a radio group, one per line, each fully labelled", () => {
    // Inderdeep UX walkthrough 2026-08-06, item 4. The three outcomes used to
    // be a `SegmentedControl`, which failed twice over: it read as a toolbar
    // rather than a decision ("it's not obvious to me that those are like the
    // three options"), and three full sentences do not fit one row at drawer
    // width ("the third option also doesn't fit on the screen"). Radios stack,
    // so each label gets the whole column and the set reads as a choice.
    const config = makeConfig([
      activity("a1", { errorPolicy: { onError: "fallback", retryable: true } }),
    ]);
    mountWithSpy(config, "a1");

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // Every option carries its whole label — nothing is abbreviated to fit.
    for (const label of [
      "Stop the workflow",
      "Follow the error path",
      "Skip this step and continue",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // A radio group states the current answer on the control itself, which a
    // row of buttons cannot.
    expect(screen.getByLabelText("Follow the error path")).toBeChecked();
    expect(screen.getByLabelText("Stop the workflow")).not.toBeChecked();

    // Each outcome explains itself in place. As a single line under a
    // segmented row this described "the selected one"; under a vertical list
    // that reading is ambiguous, so the sentence moved onto its own option.
    const section = screen.getByTestId("error-policy-section");
    expect(section.textContent).toContain(
      "The run ends here and the failure is reported.",
    );
    expect(section.textContent).toContain(
      "This step is marked skipped and the run carries on to the next one.",
    );
  });

  it("sets onError and persists it", () => {
    const config = makeConfig([
      activity("a1", { errorPolicy: { onError: "fail", retryable: true } }),
    ]);
    const { spy } = mountWithSpy(config, "a1");

    chooseOnError("Skip this step and continue");

    expect(latestNode(spy, "a1")?.errorPolicy).toEqual({
      onError: "skip",
      retryable: true,
    });
  });

  it("reveals the fallback-edge picker only when onError is 'fallback'", () => {
    const config = makeConfig(
      [
        activity("a1", { errorPolicy: { onError: "fail", retryable: true } }),
        activity("a2"),
      ],
      [{ id: "e-err", source: "a1", target: "a2", type: "error" }],
    );
    const { spy } = mountWithSpy(config, "a1");

    expect(screen.queryByTestId("error-policy-fallback-edge")).toBeNull();

    chooseOnError("Follow the error path");
    expect(latestNode(spy, "a1")?.errorPolicy?.onError).toBe("fallback");
    expect(
      screen.getByTestId("error-policy-fallback-edge"),
    ).toBeInTheDocument();

    chooseOnError("Stop the workflow");
    expect(screen.queryByTestId("error-policy-fallback-edge")).toBeNull();
  });

  it("round-trips retryable", () => {
    const config = makeConfig([
      activity("a1", { errorPolicy: { onError: "fail", retryable: true } }),
    ]);
    const { spy } = mountWithSpy(config, "a1");

    const toggle = screen.getByTestId("error-policy-retryable");
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(latestNode(spy, "a1")?.errorPolicy?.retryable).toBe(false);
    expect(screen.getByTestId("error-policy-retryable")).not.toBeChecked();

    fireEvent.click(screen.getByTestId("error-policy-retryable"));
    expect(latestNode(spy, "a1")?.errorPolicy?.retryable).toBe(true);
  });

  it("clears fallbackEdgeId when onError moves away from 'fallback'", () => {
    const config = makeConfig(
      [
        activity("a1", {
          errorPolicy: {
            onError: "fallback",
            retryable: true,
            fallbackEdgeId: "e-err",
          },
        }),
        activity("a2"),
      ],
      [{ id: "e-err", source: "a1", target: "a2", type: "error" }],
    );
    const { spy } = mountWithSpy(config, "a1");

    chooseOnError("Stop the workflow");

    const policy = latestNode(spy, "a1")?.errorPolicy;
    expect(policy?.onError).toBe("fail");
    // A stale fallbackEdgeId is the same class of dangling reference the
    // ctx-key work spent its time on — it must not survive the switch.
    expect(policy && "fallbackEdgeId" in policy).toBe(false);
  });

  it("only offers error edges leaving this node as the fallback", () => {
    const config = makeConfig(
      [
        activity("a1", {
          errorPolicy: { onError: "fallback", retryable: true },
        }),
        activity("a2"),
        activity("a3"),
      ],
      [
        { id: "e-normal", source: "a1", target: "a2", type: "normal" },
        { id: "e-err", source: "a1", target: "a3", type: "error" },
        { id: "e-other", source: "a2", target: "a3", type: "error" },
      ],
    );
    mountWithSpy(config, "a1");

    fireEvent.click(screen.getByTestId("error-policy-fallback-edge"));
    // Options render the TARGET label plus the edge id; only `e-err`
    // qualifies (error-typed AND leaving a1).
    expect(screen.getByText("e-err")).toBeInTheDocument();
    expect(screen.queryByText("e-normal")).toBeNull();
    expect(screen.queryByText("e-other")).toBeNull();
  });

  it("removing the policy drops the field entirely", () => {
    const config = makeConfig([
      activity("a1", { errorPolicy: { onError: "skip", retryable: true } }),
    ]);
    const { spy } = mountWithSpy(config, "a1");

    fireEvent.click(screen.getByTestId("error-policy-remove"));

    const node = latestNode(spy, "a1");
    expect(node && "errorPolicy" in node).toBe(false);
    expect(screen.getByTestId("error-policy-add")).toBeInTheDocument();
  });

  it("is not offered for node types whose canvas renderer has no error handle", () => {
    // Switch nodes route through cases/defaultEdge and source nodes are the
    // graph's entry point; neither mounts the bottom `error` handle, so
    // offering the policy would author a state the canvas cannot draw —
    // exactly the mismatch this section exists to remove.
    const sw: GraphNode = {
      id: "sw",
      type: "switch",
      label: "Route",
      cases: [],
    };
    const first = mountWithSpy(makeConfig([sw]), "sw");
    expect(screen.queryByTestId("error-policy-section")).toBeNull();
    first.unmount();

    const src: GraphNode = {
      id: "src",
      type: "source",
      label: "Upload",
      sourceType: "source.upload",
    };
    mountWithSpy(makeConfig([src]), "src");
    expect(screen.queryByTestId("error-policy-section")).toBeNull();
  });
});
