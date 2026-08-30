/**
 * Unit tests for `summarizeValueLine` (UX walkthrough 2026-08-06, item 9,
 * Option C).
 *
 * The property under test is not "the copy reads well" — it is that the
 * function is TOTAL and BOUNDED. The node card's result strip is one line tall
 * and can never grow, because a card that changes height when a run lands is
 * exactly the reflow item 9 exists to remove. So every input, including a
 * megabyte of OCR text or a 1000-element array, has to come back as at most
 * `SUMMARY_MAX_CHARS` characters on one line.
 *
 * The other half is that it stays kind-agnostic: it reads the SHAPE of the
 * JSON and never a field name, so the cases below are grouped by JSON type
 * rather than by artifact kind.
 */

import { describe, expect, it } from "vitest";

import type { BlobExcerpt, BlobExcerptLimits } from "./preview.types";
import {
  NO_VALUE_SUMMARY,
  SUMMARY_MAX_CHARS,
  summarizeValueLine,
} from "./summarize-output";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const LIMITS: BlobExcerptLimits = {
  maxStringChars: 500,
  maxArrayItems: 5,
  maxObjectKeys: 20,
  maxDepth: 4,
  maxTotalChars: 2000,
};

/**
 * `BlobExcerpt` carries five required fields the summary never reads
 * (`truncated`, `omissions`, `limits` …). A factory keeps each case's
 * interesting field visible instead of buried in boilerplate.
 */
function buildExcerpt(
  overrides: Partial<BlobExcerpt> & { blobPath: string },
): BlobExcerpt {
  return {
    status: "resolved",
    truncated: false,
    omissions: [],
    limits: LIMITS,
    ...overrides,
  };
}

/** A ctx-borne blob POINTER — the shape `OcrResult` travels as (G-022). */
function pointer(blobPath: string): Record<string, unknown> {
  return { blobPath, byteLength: 10 };
}

/** Nested `depth` levels deep, so recursion (if any) would be visible. */
function deepObject(depth: number): Record<string, unknown> {
  let node: Record<string, unknown> = { leaf: "bottom" };
  for (let level = 0; level < depth; level += 1) {
    node = { [`level${level}`]: node, label: `level ${level}` };
  }
  return node;
}

// ---------------------------------------------------------------------------
// Absent values
// ---------------------------------------------------------------------------

describe("summarizeValueLine — absent values", () => {
  it("reports `undefined` as no value", () => {
    // The engine never writes `undefined` into a run context, so this is a
    // sound "the bound ctx key holds nothing" signal rather than an ambiguity.
    expect(summarizeValueLine(undefined)).toBe(NO_VALUE_SUMMARY);
  });

  it("keeps an explicit `null` distinct from an absent value", () => {
    expect(summarizeValueLine(null)).toBe("null");
    expect(summarizeValueLine(null)).not.toBe(NO_VALUE_SUMMARY);
  });
});

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

describe("summarizeValueLine — strings", () => {
  it("returns the first NON-BLANK line with whitespace collapsed", () => {
    // An OCR block or a markdown document routinely opens with blank lines;
    // showing those verbatim would leave the strip apparently empty.
    expect(summarizeValueLine("\n\n  hello   world\nsecond line")).toBe(
      "hello world",
    );
  });

  it("collapses tabs and runs of spaces so the line cannot wrap", () => {
    expect(summarizeValueLine("a\t\tb   c")).toBe("a b c");
  });

  it("reports an all-whitespace string as no value", () => {
    expect(summarizeValueLine("   \n\t  \n ")).toBe(NO_VALUE_SUMMARY);
  });

  it("reports an empty string as no value", () => {
    expect(summarizeValueLine("")).toBe(NO_VALUE_SUMMARY);
  });

  it("truncates a long line with an ellipsis at the bound", () => {
    const summary = summarizeValueLine("x".repeat(500));
    expect(summary).toHaveLength(SUMMARY_MAX_CHARS);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("leaves a line that exactly fits the bound alone", () => {
    const exact = "y".repeat(SUMMARY_MAX_CHARS);
    expect(summarizeValueLine(exact)).toBe(exact);
  });
});

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

describe("summarizeValueLine — numbers and booleans", () => {
  // `0` and `false` are the falsy trap: a truthiness guard anywhere in the
  // chain would render a real, meaningful result as "no value".
  const SCALARS: Array<[string, number | boolean, string]> = [
    ["zero", 0, "0"],
    ["a positive integer", 42, "42"],
    ["a negative float", -1.5, "-1.5"],
    ["false", false, "false"],
    ["true", true, "true"],
  ];

  it.each(SCALARS)("renders %s verbatim", (_label, value, expected) => {
    expect(summarizeValueLine(value)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

describe("summarizeValueLine — arrays", () => {
  it("names an empty list rather than showing nothing", () => {
    expect(summarizeValueLine([])).toBe("empty list");
  });

  it("uses the singular noun for one element", () => {
    expect(summarizeValueLine(["only"])).toBe("1 item · only");
  });

  it("reports the length then a summary of the first element", () => {
    // Both halves matter: how much came back, and what one of them looks like.
    expect(summarizeValueLine(["a", "b", "c"])).toBe("3 items · a");
  });

  it("collapses a nested array element to its shape, not its contents", () => {
    expect(summarizeValueLine([[1, 2, 3]])).toBe("1 item · [3]");
  });

  it("collapses a nested object element to its field count", () => {
    expect(summarizeValueLine([{ a: 1, b: 2 }])).toBe("1 item · {2 fields}");
  });

  it("uses the singular for a one-field nested object", () => {
    expect(summarizeValueLine([{ a: 1 }])).toBe("1 item · {1 field}");
  });

  it("keeps null and empty-string elements legible", () => {
    expect(summarizeValueLine([null])).toBe("1 item · null");
    expect(summarizeValueLine([""])).toBe('1 item · ""');
  });
});

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

describe("summarizeValueLine — objects", () => {
  it("names an object with no fields", () => {
    expect(summarizeValueLine({})).toBe("no fields");
  });

  it("renders top-level fields as `key: value` pairs", () => {
    expect(summarizeValueLine({ label: "invoice", pages: 3 })).toBe(
      "label: invoice, pages: 3",
    );
  });

  it("collapses nested values to their shape, one level only", () => {
    expect(
      summarizeValueLine({ blob: { storage_key: "abc" }, tags: ["a", "b"] }),
    ).toBe("blob: {1 field}, tags: [2]");
  });

  it("stops at the character bound and says it stopped", () => {
    const summary = summarizeValueLine({
      alpha: "one two three four",
      beta: "five six seven eight",
      gamma: "nine ten eleven twelve",
      delta: "thirteen fourteen",
    });
    expect(summary.endsWith("…")).toBe(true);
    expect(summary.startsWith("alpha: one two three four")).toBe(true);
    expect(summary).not.toContain("gamma");
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
  });

  it("still names the field when the FIRST value alone overflows", () => {
    // Regression: the loop measured each `key: value` pair before bounding it,
    // so `{ text: "<a page of OCR>" }` — the commonest single-field output
    // there is — overflowed on entry one and the whole strip read "…".
    const summary = summarizeValueLine({
      text: `Invoice 4471 ${"x".repeat(5000)}`,
    });
    expect(summary).not.toBe("…");
    expect(summary.startsWith("text: Invoice 4471 ")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
  });

  it("keeps the bound when a long first field is followed by more", () => {
    const summary = summarizeValueLine({ text: "y".repeat(5000), pages: 3 });
    expect(summary.startsWith("text: yyy")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
  });
});

// ---------------------------------------------------------------------------
// The bound — the property the fixed-height strip actually depends on
// ---------------------------------------------------------------------------

describe("summarizeValueLine — every result fits the strip", () => {
  const LARGE_INPUTS: Array<[string, unknown]> = [
    ["a 5000-character string", "l".repeat(5000)],
    [
      "a 5000-character string behind blank lines",
      `\n\n   ${"m".repeat(5000)}`,
    ],
    ["a 20-level deep object", deepObject(20)],
    [
      "a 1000-element array of scalars",
      Array.from({ length: 1000 }, (_, i) => i),
    ],
    [
      "a 1000-element array of objects",
      Array.from({ length: 1000 }, (_, i) => ({ i, name: `row ${i}` })),
    ],
    ["an array whose first element is huge", [`${"n".repeat(5000)}`]],
    [
      "an object with 200 keys",
      Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [`key${i}`, `value ${i}`]),
      ),
    ],
    [
      "an object whose FIRST value alone overflows",
      { note: "o".repeat(5000), second: "ignored" },
    ],
    ["a very long single key", { ["p".repeat(5000)]: 1 }],
  ];

  it.each(LARGE_INPUTS)("bounds %s to one short line", (_label, value) => {
    const summary = summarizeValueLine(value);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    // One line means one line: a newline would make the strip's single row
    // clip mid-glyph rather than mid-word.
    expect(summary).not.toContain("\n");
  });

  it("bounds a resolved blob excerpt too", () => {
    const summary = summarizeValueLine(pointer("p/big"), {
      "p/big": buildExcerpt({ blobPath: "p/big", excerpt: "q".repeat(5000) }),
    });
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
  });
});

// ---------------------------------------------------------------------------
// Blob pointers (G-022)
// ---------------------------------------------------------------------------

describe("summarizeValueLine — blob pointers", () => {
  it("summarises the server-resolved EXCERPT, not the pointer", () => {
    // Summarising the pointer verbatim would print `blobPath: …/ocr.json`,
    // which says nothing about what the step produced.
    const summary = summarizeValueLine(pointer("p/1"), {
      "p/1": buildExcerpt({ blobPath: "p/1", excerpt: "hello world" }),
    });
    expect(summary).toBe("hello world");
    expect(summary).not.toContain("blobPath");
  });

  it("summarises a structured excerpt by shape, like any other value", () => {
    const summary = summarizeValueLine(pointer("p/2"), {
      "p/2": buildExcerpt({
        blobPath: "p/2",
        excerpt: { pages: [1, 2, 3], engine: "azure" },
        truncated: true,
        omissions: ["pages: showing the first 3 of 300 items"],
      }),
    });
    expect(summary).toBe("pages: [3], engine: azure");
  });

  it("says why an unavailable pointer could not be read", () => {
    const summary = summarizeValueLine(pointer("p/3"), {
      "p/3": buildExcerpt({
        blobPath: "p/3",
        status: "unavailable",
        reason: "too-large",
      }),
    });
    expect(summary).toContain("too-large");
  });

  it("falls back to a neutral label when nothing resolved the pointer", () => {
    expect(summarizeValueLine(pointer("p/4"))).toBe("stored value");
    expect(summarizeValueLine(pointer("p/4"), {})).toBe("stored value");
    // A map keyed by a DIFFERENT path must not be borrowed.
    expect(
      summarizeValueLine(pointer("p/4"), {
        "p/other": buildExcerpt({ blobPath: "p/other", excerpt: "wrong" }),
      }),
    ).toBe("stored value");
  });

  it("leaves a plain object without a blobPath alone", () => {
    // The pointer predicate is structural, so it must not swallow ordinary
    // objects that merely sit alongside an excerpt map.
    const summary = summarizeValueLine(
      { label: "invoice", byteLength: 10 },
      { "p/1": buildExcerpt({ blobPath: "p/1", excerpt: "hello world" }) },
    );
    expect(summary).toBe("label: invoice, byteLength: 10");
  });

  it("ignores a non-string or empty blobPath", () => {
    expect(summarizeValueLine({ blobPath: 7 })).toBe("blobPath: 7");
    expect(summarizeValueLine({ blobPath: "" })).toBe('blobPath: ""');
  });
});
