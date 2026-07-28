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

/**
 * D-12 — a succeeded node with no cache row was always reported as `evicted`,
 * offering a Re-run to "repopulate" it. For a `@deterministic:false` dynamic
 * node that is untrue twice over: nothing was evicted (it was never cached),
 * and re-running can never repopulate it, because §3.3 says such scripts must
 * re-execute every run and are deliberately not cached.
 *
 * Measured live on the Part-14 demo before it was tagged deterministic: a green
 * run, and the widget reading "Preview unavailable — cache evicted. Re-run to
 * repopulate."
 */
describe("noOutputReasonForNode — D-12 never-cached vs evicted", () => {
  const base = {
    runFinished: true,
    producesOutput: true,
    hasActiveRun: true,
  } as const;

  it("reports `not-cached` for a succeeded node that is never cached", () => {
    expect(
      noOutputReasonForNode({
        ...base,
        status: "succeeded",
        neverCached: true,
      }),
    ).toBe("not-cached");
  });

  it("still reports `evicted` for a succeeded node that IS cacheable", () => {
    expect(
      noOutputReasonForNode({
        ...base,
        status: "succeeded",
        neverCached: false,
      }),
    ).toBe("evicted");
  });

  it("never-cached does not mask a failure", () => {
    expect(
      noOutputReasonForNode({ ...base, status: "failed", neverCached: true }),
    ).toBe("failed");
  });

  it("offers no Re-run for `not-cached`, and says why rather than blaming an eviction", () => {
    const copy = describeNoOutput("not-cached", { isDynamicNode: true });
    expect(copy.offersRerun).toBe(false);
    expect(copy.message).toMatch(/non-deterministic/i);
    expect(copy.message).not.toMatch(/evict/i);
  });

  // D-18a — found by walking 9.5 on the standard-OCR workflow, where
  // `document.updateStatus` (a catalog-level `nonCacheable` activity, no
  // script anywhere) told the author to "Tag it `@deterministic true`". Every
  // `nonCacheable` built-in hits this: azureOcr.submit, document.storeRejection,
  // every benchmark writer.
  it("does NOT tell a built-in activity's author to edit a script they do not have", () => {
    const builtIn = describeNoOutput("not-cached");
    expect(builtIn.offersRerun).toBe(false);
    expect(builtIn.message).not.toMatch(/@deterministic/i);
    expect(builtIn.message).not.toMatch(/\bscript\b/i);
    expect(builtIn.message).not.toMatch(/evict/i);
    // Still says what happened and why there is nothing to show.
    expect(builtIn.message).toMatch(/never caches/i);

    // The dynamic-node copy keeps the actionable advice — it is actionable there.
    expect(
      describeNoOutput("not-cached", { isDynamicNode: true }).message,
    ).toMatch(/@deterministic/i);
  });
});
