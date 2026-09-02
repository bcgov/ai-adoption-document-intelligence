import { describe, expect, it } from "@jest/globals";
import { __testInternals } from "./azure-cu-analyze";
import type { CuAnalyzeOperation, CuAnalyzeResult } from "./cu-types";

const { extractInlineResult } = __testInternals;

type InlineBody = CuAnalyzeOperation & CuAnalyzeResult;

describe("extractInlineResult — CU synchronous-200 handling (B2)", () => {
  it("returns the result from a long-running-operation envelope", () => {
    const result: CuAnalyzeResult = { analyzerId: "a", contents: [] };
    const body = { status: "Succeeded", result } as InlineBody;
    expect(extractInlineResult(body)).toBe(result);
  });

  it("returns a bare CuAnalyzeResult (contents at the top level)", () => {
    // This is the shape the old code silently dropped (cast to the envelope,
    // status/result undefined → fell through to polling).
    const body = { analyzerId: "a", contents: [] } as InlineBody;
    expect(extractInlineResult(body)).toBe(body);
  });

  it("returns undefined for a non-terminal operation (no inline result)", () => {
    expect(
      extractInlineResult({ status: "Running" } as InlineBody),
    ).toBeUndefined();
  });

  it("returns undefined for an empty body", () => {
    expect(extractInlineResult({} as InlineBody)).toBeUndefined();
  });
});
