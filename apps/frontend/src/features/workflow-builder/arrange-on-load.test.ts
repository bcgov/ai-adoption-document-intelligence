/**
 * Unit tests for the pure decision helpers behind "open demos in the
 * auto-arranged view" (see `arrange-on-load.ts`). The React/xyflow timing
 * that drives them lives in `WorkflowEditorV2Page`; these cover the two
 * decisions in isolation.
 */
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { configWantsArrangeOnLoad, nodesAllMeasured } from "./arrange-on-load";

function configWithMetadata(
  metadata: Record<string, unknown>,
): Pick<GraphWorkflowConfig, "metadata"> {
  return { metadata: metadata as GraphWorkflowConfig["metadata"] };
}

describe("configWantsArrangeOnLoad", () => {
  it("is true only when metadata.arrangeOnLoad === true", () => {
    expect(
      configWantsArrangeOnLoad(configWithMetadata({ arrangeOnLoad: true })),
    ).toBe(true);
  });

  it("is false when the flag is absent (every user-authored workflow)", () => {
    expect(
      configWantsArrangeOnLoad(configWithMetadata({ name: "My workflow" })),
    ).toBe(false);
  });

  it("is false for falsy / non-true values (guards against truthy coercion)", () => {
    expect(
      configWantsArrangeOnLoad(configWithMetadata({ arrangeOnLoad: false })),
    ).toBe(false);
    expect(
      configWantsArrangeOnLoad(
        configWithMetadata({ arrangeOnLoad: "true" as unknown as boolean }),
      ),
    ).toBe(false);
  });
});

describe("nodesAllMeasured", () => {
  it("is false when nothing has mounted yet", () => {
    expect(nodesAllMeasured([])).toBe(false);
  });

  it("is true once every node reports a positive measured width", () => {
    expect(
      nodesAllMeasured([
        { measured: { width: 200 } },
        { measured: { width: 522 } },
      ]),
    ).toBe(true);
  });

  it("falls back to the node's own width when measured is absent", () => {
    expect(nodesAllMeasured([{ width: 300 }])).toBe(true);
  });

  it("is false while any node is still unmeasured (width 0 or missing)", () => {
    expect(
      nodesAllMeasured([{ measured: { width: 200 } }, { measured: {} }]),
    ).toBe(false);
    expect(
      nodesAllMeasured([
        { measured: { width: 200 } },
        { measured: { width: 0 } },
      ]),
    ).toBe(false);
  });
});
