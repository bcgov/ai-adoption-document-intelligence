import type { AnalysisResult, Span } from "@/ocr/azure-types";

/** Documents with more pages than this are refused for label suggestions. */
export const MAX_SUGGESTION_PAGES = 30;

/** Tagged text longer than this is refused, so one LLM call stays a sensible size. */
export const MAX_TAGGED_TEXT_CHARS = 120_000;

/** One OCR element the labelling screen can assign to a field. */
export interface ElementInfo {
  /** `p{page}-w{index}` or `p{page}-sm{index}`, the ids the labelling screen uses. */
  id: string;
  kind: "word" | "selectionMark";
  pageNumber: number;
  /** Word text, or "selected" / "unselected" for a checkbox. */
  content: string;
  polygon: number[];
  /** Offset of the element's span in `analyzeResult.content`. */
  offset: number;
}

/** What one tag in the tagged text points at. */
export type TagTarget =
  | { kind: "line"; pageNumber: number; wordIds: string[] }
  | {
      kind: "cell";
      pageNumber: number;
      wordIds: string[];
      selectionMarkIds: string[];
    }
  | {
      kind: "selectionMark";
      pageNumber: number;
      id: string;
      state: "selected" | "unselected";
    };

/**
 * The document text an LLM reads, with a tag at the start of every line and
 * table cell and in place of every checkbox, plus the lookups that turn a tag
 * back into OCR element ids.
 */
export interface TaggedText {
  text: string;
  /** Tag without brackets ("L12", "T2 r3 c1", "S4") to what it points at. */
  tags: Map<string, TagTarget>;
  /** Element id to the element. */
  elements: Map<string, ElementInfo>;
  pageCount: number;
}

/** Thrown when a document is too large for one suggestion call. */
export class TaggedTextLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaggedTextLimitError";
  }
}

interface Insertion {
  offset: number;
  rank: number;
  text: string;
}

interface Replacement {
  offset: number;
  length: number;
  text: string;
}

interface MarkInfo {
  info: ElementInfo;
  length: number;
}

/** When several insertions share an offset: page marker, then cell tag, then line tag. */
const INSERT_RANK = { page: 0, cell: 1, line: 2 } as const;

function inSpans(offset: number, spans: Span[]): boolean {
  return spans.some(
    (span) => offset >= span.offset && offset < span.offset + span.length,
  );
}

function firstOffset(spans: Span[]): number {
  return Math.min(...spans.map((span) => span.offset));
}

/**
 * Renders a prebuilt-layout result as tagged text. Words map to lines and
 * cells by span containment. A line whose words all sit in table cells gets
 * no tag of its own; its words are reached through the cell tags.
 */
export function renderTaggedText(result: AnalysisResult): TaggedText {
  const pages = [...(result.pages ?? [])].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );
  if (pages.length > MAX_SUGGESTION_PAGES) {
    throw new TaggedTextLimitError(
      `The document has ${pages.length} pages; label suggestions support at most ${MAX_SUGGESTION_PAGES}.`,
    );
  }
  const content = result.content ?? "";

  const elements = new Map<string, ElementInfo>();
  const words: ElementInfo[] = [];
  const marks: MarkInfo[] = [];
  for (const page of pages) {
    (page.words ?? []).forEach((word, index) => {
      if (!word.polygon || word.polygon.length < 8) return;
      const info: ElementInfo = {
        id: `p${page.pageNumber}-w${index}`,
        kind: "word",
        pageNumber: page.pageNumber,
        content: word.content,
        polygon: word.polygon,
        offset: word.span.offset,
      };
      words.push(info);
      elements.set(info.id, info);
    });
    (page.selectionMarks ?? []).forEach((mark, index) => {
      if (!mark.polygon || mark.polygon.length < 8) return;
      const info: ElementInfo = {
        id: `p${page.pageNumber}-sm${index}`,
        kind: "selectionMark",
        pageNumber: page.pageNumber,
        content: mark.state === "selected" ? "selected" : "unselected",
        polygon: mark.polygon,
        offset: mark.span.offset,
      };
      marks.push({ info, length: mark.span.length });
      elements.set(info.id, info);
    });
  }

  const tags = new Map<string, TagTarget>();
  const inserts: Insertion[] = [];
  const replacements: Replacement[] = [];

  for (const page of pages) {
    if ((page.spans ?? []).length === 0) continue;
    inserts.push({
      offset: firstOffset(page.spans),
      rank: INSERT_RANK.page,
      text: `--- page ${page.pageNumber} ---\n`,
    });
  }

  const wordsInCells = new Set<string>();
  (result.tables ?? []).forEach((table, tableIndex) => {
    for (const cell of table.cells ?? []) {
      const spans = cell.spans ?? [];
      if (spans.length === 0) continue;
      const wordIds = words
        .filter((word) => inSpans(word.offset, spans))
        .map((word) => word.id);
      const selectionMarkIds = marks
        .filter((mark) => inSpans(mark.info.offset, spans))
        .map((mark) => mark.info.id);
      const tag = `T${tableIndex + 1} r${cell.rowIndex} c${cell.columnIndex}`;
      tags.set(tag, {
        kind: "cell",
        pageNumber: cell.boundingRegions?.[0]?.pageNumber ?? 1,
        wordIds,
        selectionMarkIds,
      });
      for (const id of wordIds) wordsInCells.add(id);
      inserts.push({
        offset: firstOffset(spans),
        rank: INSERT_RANK.cell,
        text: `[${tag}] `,
      });
    }
  });

  const lines = pages
    .flatMap((page) =>
      (page.lines ?? [])
        .filter((line) => (line.spans ?? []).length > 0)
        .map((line) => ({
          pageNumber: page.pageNumber,
          spans: line.spans,
          start: firstOffset(line.spans),
        })),
    )
    .sort((a, b) => a.start - b.start);
  let lineNumber = 0;
  for (const line of lines) {
    const wordIds = words
      .filter((word) => inSpans(word.offset, line.spans))
      .map((word) => word.id);
    if (wordIds.length === 0 || wordIds.every((id) => wordsInCells.has(id))) {
      continue;
    }
    lineNumber += 1;
    const tag = `L${lineNumber}`;
    tags.set(tag, { kind: "line", pageNumber: line.pageNumber, wordIds });
    inserts.push({
      offset: line.start,
      rank: INSERT_RANK.line,
      text: `[${tag}] `,
    });
  }

  [...marks]
    .sort((a, b) => a.info.offset - b.info.offset)
    .forEach((mark, index) => {
      const tag = `S${index + 1}`;
      const state =
        mark.info.content === "selected" ? "selected" : "unselected";
      tags.set(tag, {
        kind: "selectionMark",
        pageNumber: mark.info.pageNumber,
        id: mark.info.id,
        state,
      });
      replacements.push({
        offset: mark.info.offset,
        length: Math.max(1, mark.length),
        text: `[${tag} ${state === "selected" ? "☒" : "☐"}]`,
      });
    });

  const text = compose(content, inserts, replacements);
  if (text.length > MAX_TAGGED_TEXT_CHARS) {
    throw new TaggedTextLimitError(
      `The document's tagged text is ${text.length} characters; label suggestions support at most ${MAX_TAGGED_TEXT_CHARS}.`,
    );
  }
  return { text, tags, elements, pageCount: pages.length };
}

/**
 * Copies `content` in order, adding each insertion at its offset and
 * swapping each replaced range for its replacement text.
 */
function compose(
  content: string,
  inserts: Insertion[],
  replacements: Replacement[],
): string {
  const orderedInserts = [...inserts].sort(
    (a, b) => a.offset - b.offset || a.rank - b.rank,
  );
  const orderedReplacements = [...replacements].sort(
    (a, b) => a.offset - b.offset,
  );
  const parts: string[] = [];
  let cursor = 0;
  let insertIndex = 0;
  let replaceIndex = 0;
  while (cursor < content.length || insertIndex < orderedInserts.length) {
    while (
      insertIndex < orderedInserts.length &&
      orderedInserts[insertIndex].offset <= cursor
    ) {
      parts.push(orderedInserts[insertIndex].text);
      insertIndex += 1;
    }
    while (
      replaceIndex < orderedReplacements.length &&
      orderedReplacements[replaceIndex].offset < cursor
    ) {
      replaceIndex += 1;
    }
    if (cursor >= content.length) break;
    const replacement = orderedReplacements[replaceIndex];
    if (replacement && replacement.offset === cursor) {
      parts.push(replacement.text);
      cursor += replacement.length;
      replaceIndex += 1;
      continue;
    }
    const nextInsert =
      insertIndex < orderedInserts.length
        ? orderedInserts[insertIndex].offset
        : content.length;
    const nextReplace = replacement ? replacement.offset : content.length;
    const next = Math.min(nextInsert, nextReplace, content.length);
    parts.push(content.slice(cursor, next));
    cursor = next;
  }
  return parts.join("");
}
