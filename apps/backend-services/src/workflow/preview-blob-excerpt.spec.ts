/**
 * Unit tests for the bounded-excerpt builder (G-022).
 *
 * The contract under test is not "it truncates" but "it truncates AND says so".
 * A preview that silently shows part of a payload is the exact class of bug
 * this work exists to remove.
 */

import {
  buildBoundedExcerpt,
  DEFAULT_EXCERPT_LIMITS,
  type ExcerptLimits,
} from "./preview-blob-excerpt";

const TIGHT: ExcerptLimits = {
  maxStringChars: 10,
  maxArrayItems: 2,
  maxObjectKeys: 3,
  maxDepth: 3,
  maxTotalChars: 500,
};

describe("buildBoundedExcerpt", () => {
  it("passes a small payload through untouched and reports no omissions", () => {
    const payload = { fileName: "a.pdf", pageCount: 2, success: true };
    const result = buildBoundedExcerpt(payload, TIGHT);

    expect(result.value).toEqual(payload);
    expect(result.truncated).toBe(false);
    expect(result.omissions).toEqual([]);
  });

  it("truncates a long string and says how much it kept of how much", () => {
    const result = buildBoundedExcerpt(
      { extractedText: "x".repeat(120) },
      TIGHT,
    );

    expect((result.value as { extractedText: string }).extractedText).toBe(
      `${"x".repeat(10)}…`,
    );
    expect(result.truncated).toBe(true);
    expect(result.omissions).toContain(
      "extractedText: showing the first 10 of 120 characters",
    );
  });

  it("caps arrays and says how many of how many are shown", () => {
    const result = buildBoundedExcerpt(
      { pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      TIGHT,
    );

    expect((result.value as { pages: number[] }).pages).toEqual([1, 2]);
    expect(result.omissions).toContain(
      "pages: showing the first 2 of 10 items",
    );
  });

  it("caps object width and says how many fields are shown", () => {
    const result = buildBoundedExcerpt({ a: 1, b: 2, c: 3, d: 4, e: 5 }, TIGHT);

    expect(Object.keys(result.value as object)).toEqual(["a", "b", "c"]);
    expect(result.omissions).toContain("the payload: showing 3 of 5 fields");
  });

  it("stops at the depth limit and names the path it stopped at", () => {
    const result = buildBoundedExcerpt(
      { l1: { l2: { l3: { l4: "too deep" } } } },
      TIGHT,
    );

    expect(result.value).toEqual({ l1: { l2: {} } });
    expect(result.omissions).toContain(
      "l1.l2.l3: nested content omitted below depth 3",
    );
  });

  it("enforces the total character budget and reports where it ran out", () => {
    const payload = {
      a: "y".repeat(300),
      b: "z".repeat(300),
      c: "w".repeat(300),
    };
    const result = buildBoundedExcerpt(payload, {
      ...DEFAULT_EXCERPT_LIMITS,
      maxTotalChars: 500,
    });

    const serialised = JSON.stringify(result.value);
    expect(serialised.length).toBeLessThan(800);
    expect(result.truncated).toBe(true);
    expect(
      result.omissions.some((o) => o.includes("excerpt size limit reached")),
    ).toBe(true);
  });

  it("bounds a realistically large OCR payload well under the total budget", () => {
    // A 300-page result: the shape the pointer model exists to keep out of ctx.
    const payload = {
      success: true,
      status: "succeeded",
      fileName: "big.pdf",
      extractedText: "lorem ipsum ".repeat(50_000),
      pages: Array.from({ length: 300 }, (_, i) => ({
        pageNumber: i + 1,
        words: Array.from({ length: 400 }, (_, w) => ({
          content: `word-${w}`,
          polygon: [1, 2, 3, 4, 5, 6, 7, 8],
          confidence: 0.99,
        })),
      })),
    };

    const result = buildBoundedExcerpt(payload);

    expect(JSON.stringify(result.value).length).toBeLessThanOrEqual(
      DEFAULT_EXCERPT_LIMITS.maxTotalChars * 2,
    );
    expect(result.truncated).toBe(true);
    expect(result.omissions).toContain(
      "pages: showing the first 5 of 300 items",
    );
  });

  it("keeps an extracted field value — the depth the whole fix exists for", () => {
    // `analyzeResult.documents[0].fields.<name>.content` is the value an
    // author is trying to read ("did it recognise the applicant's name?").
    // The default depth limit is chosen so that this survives.
    const result = buildBoundedExcerpt({
      analyzeResult: {
        modelId: "custom-1",
        documents: [
          {
            docType: "form",
            fields: {
              applicantName: { content: "A. Person", confidence: 0.97 },
            },
          },
        ],
      },
    });

    expect(JSON.stringify(result.value)).toContain("A. Person");
  });

  it("keeps null / number / boolean leaves verbatim", () => {
    const result = buildBoundedExcerpt({ n: null, i: 42, f: 0.5, t: true });
    expect(result.value).toEqual({ n: null, i: 42, f: 0.5, t: true });
    expect(result.truncated).toBe(false);
  });
});
