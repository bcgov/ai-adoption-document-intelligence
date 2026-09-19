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
});
