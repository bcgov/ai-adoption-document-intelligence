import {
  applyAbortedRunStatus,
  hasUnfinishedNodes,
  type NodeRunStatusValue,
} from "./node-statuses-response.dto";

/**
 * G-047 — a cancelled run polled forever.
 *
 * Cancellation stops the execution before the workflow can write a terminal
 * status, so mid-flight nodes stay `running` in the query result. The canvas
 * stops polling only when every node is terminal, so it never stopped.
 */
const entry = (status: NodeRunStatusValue) => ({ status });

describe("applyAbortedRunStatus (G-047)", () => {
  it("reports running nodes as cancelled when the run was cancelled", () => {
    const out = applyAbortedRunStatus(
      { a: entry("succeeded"), b: entry("running") },
      "CANCELLED",
    );
    expect(out.a.status).toBe("succeeded");
    expect(out.b.status).toBe("cancelled");
  });

  it("accepts Temporal's one-L spelling", () => {
    const out = applyAbortedRunStatus({ b: entry("running") }, "CANCELED");
    expect(out.b.status).toBe("cancelled");
  });

  it("treats TERMINATED the same way", () => {
    const out = applyAbortedRunStatus({ b: entry("running") }, "TERMINATED");
    expect(out.b.status).toBe("cancelled");
  });

  it("also settles nodes that never started", () => {
    const out = applyAbortedRunStatus({ b: entry("pending") }, "TERMINATED");
    expect(out.b.status).toBe("cancelled");
  });

  it("leaves a still-running run untouched", () => {
    const input = { a: entry("running") };
    expect(applyAbortedRunStatus(input, "RUNNING")).toBe(input);
  });

  it("leaves a normally-completed run untouched", () => {
    const input = { a: entry("succeeded"), b: entry("failed") };
    expect(applyAbortedRunStatus(input, "COMPLETED")).toBe(input);
  });

  it("returns the same object when nothing needs changing", () => {
    // An aborted run whose nodes all finished anyway allocates nothing.
    const input = { a: entry("succeeded") };
    expect(applyAbortedRunStatus(input, "CANCELLED")).toBe(input);
  });

  it("tolerates an unknown or missing run status", () => {
    const input = { a: entry("running") };
    expect(applyAbortedRunStatus(input, undefined)).toBe(input);
    expect(applyAbortedRunStatus(input, "")).toBe(input);
  });

  it("produces a map the canvas will treat as terminal", () => {
    // The actual acceptance criterion: polling can now stop.
    const out = applyAbortedRunStatus(
      { a: entry("running"), b: entry("pending") },
      "CANCELLED",
    );
    expect(hasUnfinishedNodes(out)).toBe(false);
  });
});

describe("hasUnfinishedNodes", () => {
  it("is false for an empty map", () => {
    expect(hasUnfinishedNodes({})).toBe(false);
  });

  it("is true while any node is running or pending", () => {
    expect(hasUnfinishedNodes({ a: entry("running") })).toBe(true);
    expect(hasUnfinishedNodes({ a: entry("pending") })).toBe(true);
  });

  it("is false once every node is terminal", () => {
    expect(
      hasUnfinishedNodes({
        a: entry("succeeded"),
        b: entry("failed"),
        c: entry("skipped"),
        d: entry("cancelled"),
      }),
    ).toBe(false);
  });
});
