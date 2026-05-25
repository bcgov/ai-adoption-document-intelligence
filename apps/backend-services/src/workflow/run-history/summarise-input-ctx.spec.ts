/**
 * Tests for `summariseInputCtx` (US-150 — Scenario 4).
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L22
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.1
 */

import { summariseInputCtx } from "./summarise-input-ctx";

describe("summariseInputCtx (US-150)", () => {
  it("takes only the first 4 top-level keys (insertion order)", () => {
    const ctx: Record<string, unknown> = {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
    };
    const out = summariseInputCtx(ctx);
    expect(Object.keys(out)).toEqual(["a", "b", "c", "d"]);
    expect(out).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it("truncates string values longer than 80 characters with an ellipsis", () => {
    const long = "x".repeat(120);
    const exactly80 = "y".repeat(80);
    const out = summariseInputCtx({ long, exactly80 });

    // Exactly-80 untouched
    expect(out.exactly80).toBe(exactly80);
    // Over-80 truncated to 80 + "…"
    expect(typeof out.long).toBe("string");
    const truncated = out.long as string;
    expect(truncated).toBe(`${"x".repeat(80)}…`);
    expect(truncated.length).toBe(81); // 80 chars + 1-char ellipsis (Unicode code point)
  });

  it('renders Document-shaped values as "Document(<storage_key tail>)"', () => {
    const ctx = {
      doc: { blobKey: "group-1/folder/path/scan-2026-05-24.pdf" },
      docNoSlash: { blobKey: "bare-name.pdf" },
      docWindows: { blobKey: "group-1\\folder\\file.pdf" },
    };
    const out = summariseInputCtx(ctx);
    expect(out.doc).toBe("Document(scan-2026-05-24.pdf)");
    expect(out.docNoSlash).toBe("Document(bare-name.pdf)");
    expect(out.docWindows).toBe("Document(file.pdf)");
  });

  it('renders nested objects as "{...}" and arrays as "[N items]"', () => {
    const ctx = {
      nested: { foo: "bar", baz: 42 },
      empty: {},
      list: [1, 2, 3, 4, 5],
      emptyList: [],
    };
    const out = summariseInputCtx(ctx);
    expect(out.nested).toBe("{...}");
    expect(out.empty).toBe("{...}");
    expect(out.list).toBe("[5 items]");
    expect(out.emptyList).toBe("[0 items]");
  });

  it("passes through numbers, booleans, and null unchanged (within the 4-key cap)", () => {
    const ctx = {
      n: 42,
      f: 3.14,
      bTrue: true,
      bFalse: false,
    };
    const out = summariseInputCtx(ctx);
    expect(out).toEqual({
      n: 42,
      f: 3.14,
      bTrue: true,
      bFalse: false,
    });
    // And `null` passes through when it's within the first 4 keys.
    expect(summariseInputCtx({ nul: null })).toEqual({ nul: null });
  });

  it("is pure — does not mutate the input ctx", () => {
    const ctx: Record<string, unknown> = {
      keep: "value",
      doc: { blobKey: "k/v/file.pdf" },
      arr: [1, 2, 3],
      nested: { x: 1 },
      extra: "should-be-dropped",
    };
    const snapshot = JSON.stringify(ctx);
    summariseInputCtx(ctx);
    expect(JSON.stringify(ctx)).toBe(snapshot);
  });

  it("handles empty objects", () => {
    expect(summariseInputCtx({})).toEqual({});
  });
});
