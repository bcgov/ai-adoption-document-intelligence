/**
 * The validation result must not change identity on every keystroke.
 *
 * `errorsByNode` is what the canvas's badge-sync effect depends on. If the
 * result memo depended on the live `config` (so bucketing could resolve
 * anchors against the graph's real node ids, G-096), every config edit — once
 * per character in a settings field — would hand out a brand-new `Map`, 300 ms
 * before the debounced validator that could change anything runs, and that
 * new Map would replace the canvas's whole node array, defeating xyflow's
 * identity reuse and re-rendering every card.
 *
 * The node-id snapshot travels with the run that produced the errors, so the
 * result is stable between runs and G-096's bucketing is unchanged.
 */
import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGraphValidation } from "./useGraphValidation";

vi.mock("../dynamic-nodes/useActivityCatalog", () => {
  const catalog = { isLoading: false, entries: [], error: null };
  return { useActivityCatalog: () => catalog };
});

function configWithLabel(label: string): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "outer", version: "1.0.0" },
    ctx: {},
    nodes: {
      // A switch with no cases: a stable, real validation error to bucket.
      "sw.1": {
        id: "sw.1",
        type: "switch",
        label,
        cases: [],
      },
    },
    edges: [],
    entryNodeId: "sw.1",
  } as unknown as GraphWorkflowConfig;
}

describe("useGraphValidation — result stability", () => {
  it("keeps errorsByNode reference-identical across config edits until the debounced validator re-runs", async () => {
    const { result, rerender } = renderHook(
      ({ config }: { config: GraphWorkflowConfig }) =>
        useGraphValidation(config, 300),
      { initialProps: { config: configWithLabel("Route") } },
    );

    await waitFor(() => expect(result.current.errorCount).toBeGreaterThan(0));
    const settled = result.current.errorsByNode;
    expect(settled.has("sw.1")).toBe(true);

    // Ten "keystrokes": ten brand-new config objects, none of which the
    // debounced validator has had time to look at.
    for (let i = 1; i <= 10; i++) {
      rerender({ config: configWithLabel(`Route${"x".repeat(i)}`) });
      expect(result.current.errorsByNode).toBe(settled);
    }
  });

  it("still buckets against the graph's real node ids, including ids containing a dot (G-096)", async () => {
    const { result } = renderHook(() =>
      useGraphValidation(configWithLabel("Route"), 10),
    );
    await waitFor(() => expect(result.current.errorCount).toBeGreaterThan(0));
    // `sw.1` contains a dot; a positional split would have filed it under `sw`.
    expect([...result.current.errorsByNode.keys()]).toContain("sw.1");
    expect(result.current.workflowLevelErrors).not.toContainEqual(
      expect.objectContaining({ path: expect.stringContaining("nodes.sw.1") }),
    );
  });
});
