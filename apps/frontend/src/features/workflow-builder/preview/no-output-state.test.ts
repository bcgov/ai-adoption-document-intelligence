/**
 * Unit tests for the G-012 no-output state model.
 *
 * The point of these tests is that each of the situations the old single
 * sentence covered now has its OWN reason, its OWN copy, and — for eviction —
 * its own recovery affordance.
 */

import { describe, expect, it } from "vitest";

import type { NodeRunStatusValue } from "../run/node-status.types";
import {
  describeNoOutput,
  NO_OUTPUT_REASONS,
  type NoOutputReason,
  noOutputReasonForNode,
} from "./no-output-state";

const base = {
  producesOutput: true,
  hasActiveRun: true,
  runFinished: false,
} as const;

describe("noOutputReasonForNode", () => {
  it("maps no active run to `no-run` regardless of status", () => {
    expect(
      noOutputReasonForNode({
        ...base,
        hasActiveRun: false,
        status: undefined,
      }),
    ).toBe("no-run");
    expect(
      noOutputReasonForNode({
        ...base,
        hasActiveRun: false,
        status: "succeeded",
      }),
    ).toBe("no-run");
  });

  it("short-circuits control-flow nodes to `not-previewable`", () => {
    expect(
      noOutputReasonForNode({
        ...base,
        producesOutput: false,
        status: "succeeded",
      }),
    ).toBe("not-previewable");
  });

  it("distinguishes a branch that was not taken from a node that never started", () => {
    // Same absent status, opposite meaning depending on whether the run is over.
    expect(
      noOutputReasonForNode({ ...base, runFinished: false, status: undefined }),
    ).toBe("not-started");
    expect(
      noOutputReasonForNode({ ...base, runFinished: true, status: undefined }),
    ).toBe("branch-not-taken");
    expect(
      noOutputReasonForNode({ ...base, runFinished: true, status: "pending" }),
    ).toBe("branch-not-taken");
    expect(
      noOutputReasonForNode({ ...base, runFinished: false, status: "pending" }),
    ).toBe("not-started");
  });

  it.each<[NodeRunStatusValue, NoOutputReason]>([
    ["running", "running"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["succeeded", "evicted"],
    ["skipped", "evicted"],
  ])("maps status %s to reason %s", (status, expected) => {
    expect(noOutputReasonForNode({ ...base, status })).toBe(expected);
  });

  it("treats a produced-output node with a missing row as an eviction, not a 'didn't run'", () => {
    // The regression guard: eviction is a DIFFERENT cause with a DIFFERENT
    // remedy and must never be folded into "didn't run".
    for (const status of ["succeeded", "skipped"] as const) {
      const reason = noOutputReasonForNode({
        ...base,
        runFinished: true,
        status,
      });
      expect(reason).toBe("evicted");
      expect(describeNoOutput(reason).offersRerun).toBe(true);
    }
  });
});

describe("describeNoOutput", () => {
  it("renders distinct copy for every reason", () => {
    const messages = NO_OUTPUT_REASONS.map((r) => describeNoOutput(r).message);
    expect(new Set(messages).size).toBe(NO_OUTPUT_REASONS.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("offers the Re-run recovery for eviction and for nothing else", () => {
    for (const reason of NO_OUTPUT_REASONS) {
      expect(describeNoOutput(reason).offersRerun).toBe(reason === "evicted");
    }
  });

  it("throws rather than silently falling through for an unmodelled reason", () => {
    expect(() =>
      describeNoOutput("something-new" as NoOutputReason),
    ).toThrowError(/unhandled variant/);
  });
});
