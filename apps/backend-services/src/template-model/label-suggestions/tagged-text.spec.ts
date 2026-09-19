import type { AnalysisResult, Page } from "@/ocr/azure-types";
import {
  loadFixtureAnalyzeResult,
  syntheticLayoutResult,
} from "@/testUtils/synthetic-layout";
import {
  MAX_SUGGESTION_PAGES,
  MAX_TAGGED_TEXT_CHARS,
  renderTaggedText,
  TaggedTextLimitError,
} from "./tagged-text";

const PLACEHOLDER_POLYGON = [0, 0, 1, 0, 1, 1, 0, 1];

/**
 * A three-page layout, with pages deliberately out of page order in the
 * `pages` array: page 1 has the line "Alpha", page 2 has the line "Bravo"
 * and a ticked checkbox, page 3 has an unticked checkbox and a table cell
 * holding "Charlie". Proves rendering follows page number and content
 * offset, not array position.
 * Content offsets: Alpha 0-5, Bravo 6-11, ":selected:" 12-22,
 * ":unselected:" 23-35, Charlie 36-43.
 */
function syntheticMultiPageLayoutResult(): AnalysisResult {
  const content = "Alpha\nBravo :selected:\n:unselected: Charlie";
  const page1: Page = {
    pageNumber: 1,
    angle: 0,
    width: 8.5,
    height: 11,
    unit: "inch",
    spans: [{ offset: 0, length: 6 }],
    words: [
      {
        content: "Alpha",
        polygon: PLACEHOLDER_POLYGON,
        confidence: 1,
        span: { offset: 0, length: 5 },
      },
    ],
    selectionMarks: [],
    lines: [
      {
        content: "Alpha",
        polygon: PLACEHOLDER_POLYGON,
        spans: [{ offset: 0, length: 5 }],
      },
    ],
  };
  const page2: Page = {
    pageNumber: 2,
    angle: 0,
    width: 8.5,
    height: 11,
    unit: "inch",
    spans: [{ offset: 6, length: 17 }],
    words: [
      {
        content: "Bravo",
        polygon: PLACEHOLDER_POLYGON,
        confidence: 1,
        span: { offset: 6, length: 5 },
      },
    ],
    selectionMarks: [
      {
        state: "selected",
        polygon: PLACEHOLDER_POLYGON,
        confidence: 1,
        span: { offset: 12, length: 10 },
      },
    ],
    lines: [
      {
        content: "Bravo",
        polygon: PLACEHOLDER_POLYGON,
        spans: [{ offset: 6, length: 5 }],
      },
    ],
  };
  const page3: Page = {
    pageNumber: 3,
    angle: 0,
    width: 8.5,
    height: 11,
    unit: "inch",
    spans: [{ offset: 23, length: 20 }],
    words: [
      {
        content: "Charlie",
        polygon: PLACEHOLDER_POLYGON,
        confidence: 1,
        span: { offset: 36, length: 7 },
      },
    ],
    selectionMarks: [
      {
        state: "unselected",
        polygon: PLACEHOLDER_POLYGON,
        confidence: 1,
        span: { offset: 23, length: 12 },
      },
    ],
    lines: [],
  };
  return {
    apiVersion: "2024-11-30",
    modelId: "prebuilt-layout",
    stringIndexType: "textElements",
    content,
    contentFormat: "text",
    pages: [page3, page1, page2],
    tables: [
      {
        rowCount: 1,
        columnCount: 1,
        cells: [
          {
            rowIndex: 0,
            columnIndex: 0,
            content: "Charlie",
            boundingRegions: [{ pageNumber: 3, polygon: PLACEHOLDER_POLYGON }],
            spans: [{ offset: 36, length: 7 }],
            elements: [],
          },
        ],
        boundingRegions: [{ pageNumber: 3, polygon: PLACEHOLDER_POLYGON }],
        spans: [{ offset: 36, length: 7 }],
      },
    ],
    paragraphs: [],
    styles: [],
    sections: [],
    figures: [],
  };
}

describe("renderTaggedText", () => {
  it("puts tags at the exact positions", () => {
    const tagged = renderTaggedText(syntheticLayoutResult());

    expect(tagged.text).toBe(
      "--- page 1 ---\n[L1] Name Jane Doe\n[S1 ☒] [L2] Yes",
    );
    expect(tagged.tags.get("L1")).toEqual({
      kind: "line",
      pageNumber: 1,
      wordIds: ["p1-w0", "p1-w1", "p1-w2"],
    });
    expect(tagged.tags.get("S1")).toEqual({
      kind: "selectionMark",
      pageNumber: 1,
      id: "p1-sm0",
      state: "selected",
    });
    expect(tagged.elements.get("p1-w3")?.content).toBe("Yes");
    expect(tagged.pageCount).toBe(1);
  });

  it("tags every checkbox of the fixture form in reading order", () => {
    const tagged = renderTaggedText(loadFixtureAnalyzeResult());
    const checkboxTags = [...tagged.tags.entries()].filter(
      ([, target]) => target.kind === "selectionMark",
    );

    expect(checkboxTags).toHaveLength(28);
    expect(tagged.text).not.toMatch(/:(un)?selected:/);
    const positions = checkboxTags.map(([tag]) =>
      tagged.text.indexOf(`[${tag} `),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("makes every fixture word reachable through a line or table-cell tag", () => {
    const tagged = renderTaggedText(loadFixtureAnalyzeResult());
    const reachable = new Set<string>();
    for (const target of tagged.tags.values()) {
      if (target.kind !== "selectionMark") {
        for (const id of target.wordIds) reachable.add(id);
      }
    }
    const wordIds = [...tagged.elements.values()]
      .filter((element) => element.kind === "word")
      .map((element) => element.id);

    expect(wordIds.length).toBeGreaterThan(400);
    expect(wordIds.filter((id) => !reachable.has(id))).toEqual([]);
  });

  it("tags the fixture's table cells and starts with a page marker", () => {
    const tagged = renderTaggedText(loadFixtureAnalyzeResult());
    const cellTags = [...tagged.tags.keys()].filter((tag) =>
      /^T\d+ r\d+ c\d+$/.test(tag),
    );

    expect(cellTags.length).toBeGreaterThan(0);
    expect(tagged.text).toContain(`[${cellTags[0]}] `);
    expect(tagged.text.startsWith("--- page 1 ---\n")).toBe(true);
  });

  it("refuses documents with too many pages", () => {
    const base = syntheticLayoutResult();
    const pages = Array.from({ length: MAX_SUGGESTION_PAGES + 1 }, (_, i) => ({
      ...base.pages[0],
      pageNumber: i + 1,
    }));

    expect(() => renderTaggedText({ ...base, pages })).toThrow(
      TaggedTextLimitError,
    );
  });

  it("refuses documents whose tagged text is too long", () => {
    const base = syntheticLayoutResult();
    const content = "x".repeat(MAX_TAGGED_TEXT_CHARS + 1);

    expect(() =>
      renderTaggedText({
        ...base,
        content,
        pages: [
          {
            ...base.pages[0],
            words: [],
            selectionMarks: [],
            lines: [],
            spans: [{ offset: 0, length: content.length }],
          },
        ],
      }),
    ).toThrow(TaggedTextLimitError);
  });

  it("refuses an oversized document before indexing its words, lines and cells", () => {
    const base = syntheticLayoutResult();
    const content = "x".repeat(MAX_TAGGED_TEXT_CHARS + 1);
    // Enough lines and words that indexing them (the old behaviour: a full
    // scan of `words` per line) would take well over a second. The pre-check
    // on `content.length` must refuse before any of this is built, so this
    // test's own runtime is the proof: it stays fast only if the index was
    // never built.
    const wordCount = 15_000;
    const words = Array.from({ length: wordCount }, (_, i) => ({
      content: "w",
      polygon: [0, 0, 1, 0, 1, 1, 0, 1],
      confidence: 1,
      span: { offset: i, length: 1 },
    }));
    const lines = Array.from({ length: wordCount }, (_, i) => ({
      content: "w",
      polygon: [0, 0, 1, 0, 1, 1, 0, 1],
      spans: [{ offset: i, length: 1 }],
    }));

    const start = performance.now();
    expect(() =>
      renderTaggedText({
        ...base,
        content,
        pages: [
          {
            ...base.pages[0],
            words,
            lines,
            selectionMarks: [],
            spans: [{ offset: 0, length: content.length }],
          },
        ],
      }),
    ).toThrow(TaggedTextLimitError);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(200);
  });

  it("keeps element ids tied to the raw per-page index after a skipped word, through the offset-sorted lookup", () => {
    const base = syntheticLayoutResult();
    const page = base.pages[0];
    // Jane (index 1) gets an invalid polygon and is skipped. Doe (index 2)
    // must keep id "p1-w2" rather than shifting down to "p1-w1" — the
    // frontend rebuilds the same ids independently by raw index, so a shift
    // here would desync every id the labelling screen already has.
    const wordsWithGap = [
      page.words[0],
      { ...page.words[1], polygon: [] },
      page.words[2],
    ];

    const tagged = renderTaggedText({
      ...base,
      pages: [
        {
          ...page,
          words: wordsWithGap,
          selectionMarks: [],
          lines: [
            {
              content: "Name Doe",
              polygon: PLACEHOLDER_POLYGON,
              // Covers Name (0-4) and Doe (10-13); Jane's span (5-9) sits in
              // the gap left by the skipped word.
              spans: [{ offset: 0, length: 13 }],
            },
          ],
        },
      ],
    });

    expect(tagged.elements.has("p1-w1")).toBe(false);
    expect(tagged.elements.get("p1-w0")?.content).toBe("Name");
    expect(tagged.elements.get("p1-w2")?.content).toBe("Doe");
    expect(tagged.tags.get("L1")).toEqual({
      kind: "line",
      pageNumber: 1,
      wordIds: ["p1-w0", "p1-w2"],
    });
  });

  it("renders a shuffled multi-page layout in page order, with tags numbered continuously across pages", () => {
    const tagged = renderTaggedText(syntheticMultiPageLayoutResult());

    expect(tagged.text).toBe(
      "--- page 1 ---\n[L1] Alpha\n--- page 2 ---\n[L2] Bravo [S1 ☒]\n--- page 3 ---\n[S2 ☐] [T1 r0 c0] Charlie",
    );
    expect(tagged.pageCount).toBe(3);
    expect(tagged.tags.get("L1")).toEqual({
      kind: "line",
      pageNumber: 1,
      wordIds: ["p1-w0"],
    });
    expect(tagged.tags.get("L2")).toEqual({
      kind: "line",
      pageNumber: 2,
      wordIds: ["p2-w0"],
    });
    expect(tagged.tags.get("S1")).toEqual({
      kind: "selectionMark",
      pageNumber: 2,
      id: "p2-sm0",
      state: "selected",
    });
    expect(tagged.tags.get("S2")).toEqual({
      kind: "selectionMark",
      pageNumber: 3,
      id: "p3-sm0",
      state: "unselected",
    });
    expect(tagged.tags.get("T1 r0 c0")).toEqual({
      kind: "cell",
      pageNumber: 3,
      wordIds: ["p3-w0"],
      selectionMarkIds: [],
    });
    expect(tagged.elements.get("p1-w0")?.pageNumber).toBe(1);
    expect(tagged.elements.get("p3-w0")?.pageNumber).toBe(3);
  });
});
