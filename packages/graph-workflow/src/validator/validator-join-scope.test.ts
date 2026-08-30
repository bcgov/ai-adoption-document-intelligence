import type { GraphValidationError, GraphWorkflowConfig } from "../types";
import { validateGraphConfig } from "./validator";

/**
 * G-036 — a join can only read results a map actually handed it.
 *
 * `executeBranchSubgraph` allocates `mapBranchResults` per ITERATION, so an
 * inner map's results are gone when its iteration ends. A join outside that
 * scope throws `No results found for map node <id>` at run time, and nothing
 * rejected the shape statically — the picker's only filter was `type === "map"`.
 */
function activity(id: string) {
  return { id, type: "activity", label: id, activityType: "azureOcr.submit" };
}

function map(id: string, bodyEntryNodeId: string, bodyExitNodeId: string) {
  return {
    id,
    type: "map",
    label: id,
    collectionCtxKey: "segments",
    itemCtxKey: "currentSegment",
    maxConcurrency: 5,
    bodyEntryNodeId,
    bodyExitNodeId,
  };
}

function join(id: string, sourceMapNodeId: string) {
  return {
    id,
    type: "join",
    label: id,
    sourceMapNodeId,
    strategy: "all",
    resultsCtxKey: "results",
  };
}

function configWith(
  nodes: Record<string, unknown>,
  edges: Array<{ id: string; source: string; target: string }> = [],
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    entryNodeId: Object.keys(nodes)[0] ?? "",
    nodes,
    edges: edges.map((e) => ({ ...e, type: "normal" })),
    ctx: {
      segments: { type: "array" },
      currentSegment: { type: "object" },
      results: { type: "array" },
    },
    metadata: {},
  } as unknown as GraphWorkflowConfig;
}

const scopeErrors = (cfg: GraphWorkflowConfig) =>
  (validateGraphConfig(cfg).errors ?? []).filter(
    (e: GraphValidationError) =>
      e.path.endsWith(".sourceMapNodeId") &&
      (e.message.includes("discarded when each item finishes") ||
        e.message.includes("has not finished when it runs")),
  );

describe("G-036 — join / loop scope", () => {
  it("accepts the ordinary shape: a join after the loop it collects from", () => {
    const cfg = configWith(
      { outer: map("outer", "a", "a"), a: activity("a"), j: join("j", "outer") },
      [{ id: "e1", source: "outer", target: "j" }],
    );
    expect(scopeErrors(cfg)).toHaveLength(0);
  });

  it("rejects a join collecting from a loop nested inside another loop", () => {
    // `inner` runs inside `outer`'s body, so its results die with each item.
    const cfg = configWith(
      {
        outer: map("outer", "inner", "inner"),
        inner: map("inner", "work", "work"),
        work: activity("work"),
        j: join("j", "inner"),
      },
      [{ id: "e1", source: "outer", target: "j" }],
    );
    const issues = scopeErrors(cfg);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].path).toBe("nodes.j.sourceMapNodeId");
    expect(issues[0].message).toContain("discarded when each item finishes");
    expect(issues[0].message).toContain("outer");
  });

  it("accepts that same inner loop when the join is inside the outer body too", () => {
    const cfg = configWith(
      {
        outer: map("outer", "inner", "j"),
        inner: map("inner", "work", "work"),
        work: activity("work"),
        j: join("j", "inner"),
      },
      [{ id: "e1", source: "inner", target: "j" }],
    );
    expect(scopeErrors(cfg)).toHaveLength(0);
  });

  it("rejects a join sitting inside the body of its own source loop", () => {
    const cfg = configWith(
      {
        m: map("m", "work", "j"),
        work: activity("work"),
        j: join("j", "m"),
      },
      [{ id: "e1", source: "work", target: "j" }],
    );
    const issues = scopeErrors(cfg);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("has not finished when it runs");
  });

  it("blocks Save on a cross-scope join", () => {
    const cfg = configWith(
      {
        outer: map("outer", "inner", "inner"),
        inner: map("inner", "work", "work"),
        work: activity("work"),
        j: join("j", "inner"),
      },
      [{ id: "e1", source: "outer", target: "j" }],
    );
    expect(validateGraphConfig(cfg).valid).toBe(false);
  });

  it("does not double-report a join whose source does not exist", () => {
    // `validateMapJoinNodes` already owns that anchor.
    const cfg = configWith({ j: join("j", "nope"), a: activity("a") });
    expect(scopeErrors(cfg)).toHaveLength(0);
  });
});
