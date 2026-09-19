import * as fs from "node:fs";
import * as path from "node:path";
import {
  FIXTURES_DIR,
  loadFixtureAnalyzeResult,
  syntheticLayoutResult,
} from "@/testUtils/synthetic-layout";
import {
  normalizeForMatch,
  resolveRefs,
  type SuggestedRef,
} from "./resolve-refs";
import {
  type ElementInfo,
  renderTaggedText,
  type TaggedText,
} from "./tagged-text";

const none: ReadonlySet<string> = new Set<string>();

/** A tagged text with one line "L1" whose words are given, for edge cases. */
function oneLine(words: string[]): TaggedText {
  const elements = new Map(
    words.map((content, index) => [
      `p1-w${index}`,
      {
        id: `p1-w${index}`,
        kind: "word" as const,
        pageNumber: 1,
        content,
        polygon: [index, 0, index + 1, 0, index + 1, 1, index, 1],
        offset: index * 10,
      },
    ]),
  );
  return {
    text: `[L1] ${words.join(" ")}`,
    tags: new Map([
      [
        "L1",
        {
          kind: "line" as const,
          pageNumber: 1,
          wordIds: words.map((_, index) => `p1-w${index}`),
        },
      ],
    ]),
    elements,
    pageCount: 1,
  };
}

describe("normalizeForMatch", () => {
  it("folds case, width and spacing", () => {
    expect(normalizeForMatch("  Jane\t DOE ")).toBe("jane doe");
    expect(normalizeForMatch("ＡＢＣ")).toBe("abc");
  });
});

describe("resolveRefs", () => {
  const tagged = renderTaggedText(syntheticLayoutResult());

  it("resolves a value inside a line", () => {
    expect(
      resolveRefs([{ tag: "L1", text: "Jane Doe" }], tagged, false, none),
    ).toEqual({
      elementIds: ["p1-w1", "p1-w2"],
      value: "Jane Doe",
      pageNumber: 1,
      polygon: [2, 0, 5, 0, 5, 1, 2, 1],
    });
  });

  it("matches regardless of case and spacing", () => {
    expect(
      resolveRefs([{ tag: " L1 ", text: "  jane   DOE " }], tagged, false, none)
        ?.elementIds,
    ).toEqual(["p1-w1", "p1-w2"]);
  });

  it("falls back to the shortest run containing a value glued to its caption", () => {
    const glued = oneLine(["Date:2026-03-14", "signed"]);
    expect(
      resolveRefs([{ tag: "L1", text: "2026-03-14" }], glued, false, none),
    ).toEqual(expect.objectContaining({ elementIds: ["p1-w0"] }));
  });

  it("skips words already claimed by an earlier field", () => {
    const twice = oneLine(["2026-01-15", "and", "2026-01-15"]);
    expect(
      resolveRefs(
        [{ tag: "L1", text: "2026-01-15" }],
        twice,
        false,
        new Set(["p1-w0"]),
      )?.elementIds,
    ).toEqual(["p1-w2"]);
  });

  it("joins several refs in order", () => {
    const result = resolveRefs(
      [
        { tag: "L1", text: "Jane" },
        { tag: "L2", text: "Yes" },
      ],
      tagged,
      false,
      none,
    );
    expect(result?.elementIds).toEqual(["p1-w1", "p1-w3"]);
    expect(result?.value).toBe("Jane Yes");
  });

  it("resolves a checkbox tag for a checkbox field", () => {
    expect(resolveRefs([{ tag: "S1", text: "" }], tagged, true, none)).toEqual({
      elementIds: ["p1-sm0"],
      value: "selected",
      pageNumber: 1,
      polygon: [0, 2, 1, 2, 1, 3, 0, 3],
    });
  });

  it.each<[string, SuggestedRef[], boolean]>([
    ["an unknown tag", [{ tag: "L9", text: "Jane" }], false],
    ["text that is not on the tag", [{ tag: "L1", text: "John" }], false],
    ["empty text on a line", [{ tag: "L1", text: "  " }], false],
    ["a checkbox tag on a text field", [{ tag: "S1", text: "" }], false],
    ["a line tag on a checkbox field", [{ tag: "L1", text: "Jane" }], true],
    ["no refs", [], false],
  ])("drops the field for %s", (_, refs, expectSelectionMark) => {
    expect(resolveRefs(refs, tagged, expectSelectionMark, none)).toBeNull();
  });

  it("reproduces every reference label of the fixture form from ideal replies", () => {
    const result = loadFixtureAnalyzeResult();
    const fixtureTagged = renderTaggedText(result);
    const page = result.pages[0];
    const labels = (
      JSON.parse(
        fs.readFileSync(
          path.join(FIXTURES_DIR, "form_image_0.jpg.labels.json"),
          "utf-8",
        ),
      ) as {
        labels: Array<{
          label: string;
          value: Array<{ text: string; boundingBoxes: number[][] }>;
        }>;
      }
    ).labels;
    const elements = [...fixtureTagged.elements.values()];
    const failures: string[] = [];
    const cases: Array<{
      name: string;
      isCheckbox: boolean;
      expected: ElementInfo[];
    }> = [];

    for (const label of labels) {
      const isCheckbox = label.value.every(
        (v) => v.text === ":selected:" || v.text === ":unselected:",
      );
      const found = label.value.map((v) => {
        const point = centre(
          v.boundingBoxes[0].map(
            (n, i) => n * (i % 2 === 0 ? page.width : page.height),
          ),
        );
        return elements.find(
          (e) =>
            e.kind === (isCheckbox ? "selectionMark" : "word") &&
            contains(e.polygon, point),
        );
      });
      const expected = found.filter((e): e is ElementInfo => e !== undefined);
      if (expected.length !== found.length) {
        failures.push(`${label.label}: a reference box matched no OCR element`);
        continue;
      }
      expected.sort((a, b) => a.offset - b.offset);
      cases.push({ name: label.label, isCheckbox, expected });
    }

    // Resolve in the order the values appear on the page, which is the order
    // the prompt asks the LLM to list fields in.
    cases.sort((a, b) => a.expected[0].offset - b.expected[0].offset);
    const claimed = new Set<string>();
    for (const { name, isCheckbox, expected } of cases) {
      const expectedIds = expected.map((e) => e.id);
      const resolved = resolveRefs(
        idealRefs(fixtureTagged, expectedIds, isCheckbox),
        fixtureTagged,
        isCheckbox,
        claimed,
      );
      if (resolved === null) {
        failures.push(`${name}: dropped`);
        continue;
      }
      for (const id of resolved.elementIds) claimed.add(id);
      if (resolved.elementIds.join(",") !== expectedIds.join(",")) {
        failures.push(
          `${name}: got ${resolved.elementIds.join(",")}, expected ${expectedIds.join(",")}`,
        );
      }
    }

    expect(labels).toHaveLength(74);
    expect(failures).toEqual([]);
  });
});

function centre(polygon: number[]): [number, number] {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

function contains(polygon: number[], [x, y]: [number, number]): boolean {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  return (
    x >= Math.min(...xs) &&
    x <= Math.max(...xs) &&
    y >= Math.min(...ys) &&
    y <= Math.max(...ys)
  );
}

/** The refs a perfect LLM would return: a cell tag when the word is in a cell, else its line tag. */
function idealRefs(
  tagged: TaggedText,
  ids: string[],
  isCheckbox: boolean,
): SuggestedRef[] {
  if (isCheckbox) {
    const tag = [...tagged.tags.entries()].find(
      ([, target]) => target.kind === "selectionMark" && target.id === ids[0],
    )?.[0];
    return tag ? [{ tag, text: "" }] : [];
  }
  const refs: SuggestedRef[] = [];
  for (const id of ids) {
    let tag: string | undefined;
    for (const [candidate, target] of tagged.tags) {
      if (target.kind === "cell" && target.wordIds.includes(id)) {
        tag = candidate;
        break;
      }
      if (target.kind === "line" && target.wordIds.includes(id) && !tag) {
        tag = candidate;
      }
    }
    if (!tag) throw new Error(`no tag holds ${id}`);
    const word = tagged.elements.get(id)?.content ?? "";
    const last = refs[refs.length - 1];
    if (last && last.tag === tag) {
      last.text = `${last.text} ${word}`;
    } else {
      refs.push({ tag, text: word });
    }
  }
  return refs;
}
