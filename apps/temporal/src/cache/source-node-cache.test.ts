/**
 * Unit tests for the Phase 4 source-node cache writer (US-133 Scenario 3).
 *
 * Focus: the writer is BEST-EFFORT — a failed `upsert` must not abort the
 * workflow (§3.2). The `deps.upsert` proxy is a Temporal activity, so a
 * terminal failure surfaces as a thrown error here; `writeSourceNodeCache`
 * must swallow it and still return the computed hashes.
 */

import type { SourceNode } from "@ai-di/graph-workflow";
import { describe, expect, it, jest } from "@jest/globals";
import type { CachedActivityDeps } from "./cached-activity";
import { writeSourceNodeCache } from "./source-node-cache";

function makeDeps(): {
  deps: CachedActivityDeps;
  upsert: jest.Mock<(input: unknown) => Promise<void>>;
} {
  const findFresh = jest
    .fn<(input: unknown) => Promise<null>>()
    .mockResolvedValue(null);
  const upsert = jest
    .fn<(input: unknown) => Promise<void>>()
    .mockResolvedValue(undefined);
  return {
    deps: { findFresh, upsert } as unknown as CachedActivityDeps,
    upsert,
  };
}

const sourceNode = {
  id: "upload1",
  type: "source",
  sourceType: "source.upload",
  name: "Upload",
  parameters: {},
} as unknown as SourceNode;

describe("writeSourceNodeCache", () => {
  it("writes the cache row keyed on the inbound payload and returns the hashes", async () => {
    const { deps, upsert } = makeDeps();
    const initialCtx = { document: { id: "d-1" } };

    const result = await writeSourceNodeCache(
      deps,
      sourceNode,
      initialCtx,
      "wfl-1",
    );

    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0][0] as {
      workflowLineageId: string;
      nodeId: string;
      outputCtx: unknown;
    };
    expect(call.workflowLineageId).toBe("wfl-1");
    expect(call.nodeId).toBe("upload1");
    // Source nodes write `outputCtx === initialCtx`.
    expect(call.outputCtx).toEqual(initialCtx);
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("§3.2 — swallows a failed upsert (best-effort) and still returns the hashes", async () => {
    const { deps, upsert } = makeDeps();
    // Simulate a terminal ActivityFailure from the upsert proxy.
    upsert.mockRejectedValueOnce(new Error("DB unavailable"));

    const result = await writeSourceNodeCache(
      deps,
      sourceNode,
      { document: { id: "d-2" } },
      "wfl-1",
    );

    // The failure did NOT propagate; the workflow can continue.
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
