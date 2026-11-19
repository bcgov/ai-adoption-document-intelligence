/**
 * `describeNodeError` decides what a failed step says on the canvas.
 *
 * Regression context: every failed node reported the string
 * `"Activity task failed"` because that is the `message` Temporal puts on the
 * `ActivityFailure` envelope. A developer whose OCR poll returned 404 saw a red
 * step with no reason on it and could not tell a configuration problem from a
 * code defect.
 */

import { describeNodeError } from "./describe-node-error";

/**
 * Build the shape Temporal hands the runner: an outer failure whose `message`
 * is a generic envelope and whose `cause` carries what actually went wrong.
 */
function withCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

describe("describeNodeError", () => {
  it("returns the activity's message from under an ActivityFailure envelope", () => {
    const error = withCause(
      "Activity task failed",
      new Error(
        'Failed to poll OCR results. Status: 404 No analyze result "abc" under model "prebuilt-layout".',
      ),
    );

    expect(describeNodeError(error)).toBe(
      'Failed to poll OCR results. Status: 404 No analyze result "abc" under model "prebuilt-layout".',
    );
  });

  it("digs through more than one generic envelope", () => {
    const error = withCause(
      "Child Workflow execution failed",
      withCause(
        "Activity task failed",
        new Error("Azure Document Intelligence credentials not configured."),
      ),
    );

    expect(describeNodeError(error)).toBe(
      "Azure Document Intelligence credentials not configured.",
    );
  });

  it("keeps a specific message that has no cause at all", () => {
    expect(describeNodeError(new Error('Blob not found: "missing.pdf"'))).toBe(
      'Blob not found: "missing.pdf"',
    );
  });

  it("falls back to the envelope when the whole chain is generic", () => {
    expect(
      describeNodeError(withCause("Activity task failed", undefined)),
    ).toBe("Activity task failed");
  });

  it("stops on a cause cycle instead of spinning", () => {
    const outer = new Error("Activity task failed");
    const inner = new Error("Workflow execution failed");
    (outer as Error & { cause?: unknown }).cause = inner;
    (inner as Error & { cause?: unknown }).cause = outer;

    expect(describeNodeError(outer)).toBe("Activity task failed");
  });

  it("handles a thrown non-Error value", () => {
    expect(describeNodeError("something broke")).toBe("something broke");
    expect(describeNodeError(42)).toBe("42");
  });

  it("prefers the outermost specific message over deeper ones", () => {
    const error = withCause(
      "Activity task failed",
      withCause("Split Document failed", new Error("ENOENT")),
    );

    expect(describeNodeError(error)).toBe("Split Document failed");
  });
});
