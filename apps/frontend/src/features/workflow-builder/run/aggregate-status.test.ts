/**
 * G-095 — collapsing a group must not destroy information its expanded members
 * were already showing.
 *
 * `getAggregateStatus` returned only four of the six statuses: `skipped` folded
 * into `succeeded` (so an all-cached group showed a green tick where every
 * member showed the violet bolt) and `cancelled` fell through to `pending` (so
 * an aborted run's group read as "not started yet" — the opposite of the
 * truth). The `cancelled` case became reachable rather than hypothetical when
 * G-047 made it a real `NodeRunStatusValue`.
 */
import { describe, expect, it } from "vitest";
import type { NodeRunStatus, NodeRunStatusValue } from "./node-status.types";
import { getAggregateStatus } from "./RunStateContext";

function statuses(
  entries: Record<string, NodeRunStatusValue>,
): Record<string, NodeRunStatus> {
  const out: Record<string, NodeRunStatus> = {};
  for (const [id, status] of Object.entries(entries)) {
    out[id] = { status } as NodeRunStatus;
  }
  return out;
}

describe("getAggregateStatus", () => {
  it("is pending for an empty group", () => {
    expect(getAggregateStatus([], {})).toBe("pending");
  });

  it("reports failed above everything else", () => {
    expect(
      getAggregateStatus(
        ["a", "b", "c"],
        statuses({ a: "running", b: "failed", c: "cancelled" }),
      ),
    ).toBe("failed");
  });

  it("reports running above cancelled — there is still work in flight", () => {
    expect(
      getAggregateStatus(
        ["a", "b"],
        statuses({ a: "running", b: "cancelled" }),
      ),
    ).toBe("running");
  });

  it("reports succeeded when every member really ran", () => {
    expect(
      getAggregateStatus(
        ["a", "b"],
        statuses({ a: "succeeded", b: "succeeded" }),
      ),
    ).toBe("succeeded");
  });

  // The two cells the old four-status version could not express.
  it("reports skipped when EVERY member was skipped, not succeeded", () => {
    expect(
      getAggregateStatus(["a", "b"], statuses({ a: "skipped", b: "skipped" })),
    ).toBe("skipped");
  });

  it("reports cancelled rather than pending when a member was cancelled", () => {
    expect(
      getAggregateStatus(
        ["a", "b"],
        statuses({ a: "succeeded", b: "cancelled" }),
      ),
    ).toBe("cancelled");
  });

  it("still reports succeeded for a mix of run and cached members", () => {
    // Some ran, some were served from cache — the group as a whole succeeded.
    expect(
      getAggregateStatus(
        ["a", "b"],
        statuses({ a: "succeeded", b: "skipped" }),
      ),
    ).toBe("succeeded");
  });

  it("is pending while a member has not started", () => {
    expect(
      getAggregateStatus(
        ["a", "b"],
        statuses({ a: "succeeded", b: "pending" }),
      ),
    ).toBe("pending");
  });

  it("treats an unknown member as pending rather than terminal", () => {
    expect(
      getAggregateStatus(["a", "ghost"], statuses({ a: "succeeded" })),
    ).toBe("pending");
  });
});
