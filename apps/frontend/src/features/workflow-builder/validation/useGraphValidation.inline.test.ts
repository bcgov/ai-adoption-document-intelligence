/**
 * G-015 — an inline child graph's problems must reach the same surfaces the
 * outer graph's do: the top-bar count and the drawer. The validator now
 * descends (`packages/graph-workflow/src/validator/validator.ts`); this pins
 * the editor-side half — that the anchor shape
 * `nodes.<parentId>.inline.<inner path>` buckets onto the PARENT node rather
 * than falling into the workflow-level list, so the canvas has a badge to
 * draw and the drawer row has somewhere to navigate.
 */
import type {
  ChildWorkflowNode,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGraphValidation } from "./useGraphValidation";

vi.mock("../dynamic-nodes/useActivityCatalog", () => {
  // Stable reference — the hook memoises on `entries` identity, so returning
  // a fresh array each call would re-trigger its effect forever.
  const catalog = { isLoading: false, entries: [], error: null };
  return { useActivityCatalog: () => catalog };
});

function configWithInline(entryNodeId: string): GraphWorkflowConfig {
  const inner: GraphWorkflowConfig = {
    schemaVersion: "1.0",
    metadata: { name: "inner", version: "1.0.0" },
    ctx: {},
    nodes: {
      step: {
        id: "step",
        type: "activity",
        label: "Inner step",
        activityType: "data.transform",
        parameters: {
          inputFormat: "json",
          outputFormat: "json",
          fieldMapping: "{}",
        },
      },
    },
    edges: [],
    entryNodeId,
  };
  const child: ChildWorkflowNode = {
    id: "child_1",
    type: "childWorkflow",
    label: "Run the sub-workflow",
    workflowRef: { type: "inline", graph: inner },
  };
  return {
    schemaVersion: "1.0",
    metadata: { name: "outer", version: "1.0.0" },
    ctx: {},
    nodes: { child_1: child },
    edges: [],
    entryNodeId: "child_1",
  };
}

describe("useGraphValidation — inline child graphs (G-015)", () => {
  it("surfaces an inline error in the drawer and the top-bar count", async () => {
    // `nope` is not a node in the inner graph — a dangling entry node.
    // Hoisted so the hook sees a STABLE config reference across re-renders
    // (the effect keys on identity).
    const config = configWithInline("nope");
    vi.useFakeTimers();
    const { result } = renderHook(() => useGraphValidation(config, 0));
    await act(async () => {
      vi.runAllTimers();
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.errorCount).toBeGreaterThan(0));

    // Top-bar count: inner errors are counted like any other.
    const inline = result.current.errors.filter((e) =>
      e.path.startsWith("nodes.child_1.inline"),
    );
    expect(inline.length).toBeGreaterThan(0);
    expect(inline[0].message).toMatch(/inline child graph/i);

    // Drawer/canvas: bucketed onto the parent node, NOT workflow-level.
    expect(result.current.errorsByNode.get("child_1")).toBeDefined();
    expect(
      result.current.errorsByNode
        .get("child_1")
        ?.some((e) => e.path.startsWith("nodes.child_1.inline")),
    ).toBe(true);
    expect(
      result.current.workflowLevelErrors.some((e) =>
        e.path.includes(".inline"),
      ),
    ).toBe(false);
  });

  it("stays quiet for a valid inline child graph", async () => {
    const config = configWithInline("step");
    vi.useFakeTimers();
    const { result } = renderHook(() => useGraphValidation(config, 0));
    await act(async () => {
      vi.runAllTimers();
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(
      result.current.errors.filter((e) => e.path.includes(".inline")),
    ).toEqual([]);
  });
});
