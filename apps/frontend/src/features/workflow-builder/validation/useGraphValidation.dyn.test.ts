/**
 * Dynamic-node (`dyn.*`) input health in the unified problems surface.
 *
 * The auto-wire pass inside `useGraphValidation` resolves each node's
 * required inputs against the catalog; a dyn node's ports only exist in the
 * merged catalog `useActivityCatalog` serves, so the hook must thread that
 * list through to `autoWireIssuesToValidationErrors` — otherwise a dyn node
 * with a required unbound input contributes no warning at all and the
 * top-bar count / node badge / drawer all read healthy.
 */
import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGraphValidation } from "./useGraphValidation";

// Stable reference — the hook memoises on `entries` identity, so returning
// a fresh array each call would re-trigger its effect forever.
const { catalogMock } = vi.hoisted(() => ({
  catalogMock: {
    isLoading: false,
    entries: [
      {
        activityType: "dyn.sentiment-scorer",
        category: "custom",
        description: "Scores a document",
        iconHint: "sparkles",
        colorHint: "grape",
        inputs: [
          {
            name: "document",
            label: "Document",
            required: true,
            kind: "Document",
          },
        ],
        outputs: [{ name: "score", label: "Score", kind: "ValidationResult" }],
      },
    ],
    error: null,
  },
}));

vi.mock("../dynamic-nodes/useActivityCatalog", () => ({
  useActivityCatalog: () => catalogMock,
}));

function dynConfig(options: { bound: boolean }): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "dyn-test", version: "1.0.0" },
    ctx: options.bound
      ? { doc: { type: "object", kind: "Document", isInput: true } }
      : {},
    nodes: {
      D: {
        id: "D",
        type: "activity",
        label: "Score it",
        activityType: "dyn.sentiment-scorer",
        ...(options.bound
          ? {
              inputs: [{ port: "document", ctxKey: "doc" }],
              metadata: { lockedInputPorts: ["document"] },
            }
          : {}),
      },
    },
    edges: [],
    entryNodeId: "D",
  };
}

async function validate(config: GraphWorkflowConfig) {
  vi.useFakeTimers();
  const { result } = renderHook(() => useGraphValidation(config, 0));
  await act(async () => {
    vi.runAllTimers();
  });
  vi.useRealTimers();
  await waitFor(() => expect(result.current.isPending).toBe(false));
  return result;
}

describe("useGraphValidation — dyn.* input health via the merged catalog", () => {
  it("warns on a dyn node's required unbound input", async () => {
    const result = await validate(dynConfig({ bound: false }));

    const warning = result.current.errors.find(
      (e) => e.path === "nodes.D.inputs.document",
    );
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe("warning");
    expect(result.current.warningCount).toBeGreaterThan(0);
    // Bucketed under the node, so the canvas has a badge to draw.
    expect(
      result.current.errorsByNode
        .get("D")
        ?.some((e) => e.path === "nodes.D.inputs.document"),
    ).toBe(true);
  });

  it("stays quiet when the dyn input is pinned to a live workflow variable", async () => {
    const result = await validate(dynConfig({ bound: true }));

    expect(
      result.current.errors.filter((e) => e.path === "nodes.D.inputs.document"),
    ).toEqual([]);
  });
});
