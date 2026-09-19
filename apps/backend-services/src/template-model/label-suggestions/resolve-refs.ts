import type { ElementInfo, TaggedText } from "./tagged-text";

/** One pointer from an LLM reply: a tag, and the value's exact text after it. */
export interface SuggestedRef {
  tag: string;
  text: string;
}

export interface ResolvedRefs {
  elementIds: string[];
  value: string;
  pageNumber: number;
  /** Union rectangle of the elements, in the OCR page's units. */
  polygon: number[];
}

interface CandidateWord {
  id: string;
  norm: string;
  element: ElementInfo;
}

/** Case-, width- and spacing-insensitive form used to compare reply text with OCR words. */
export function normalizeForMatch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Turns an LLM's refs for one field into OCR element ids. Returns null, and
 * the field is dropped rather than guessed, when any ref names an unknown tag,
 * its text is not on that tag, or the ref kind does not fit the field.
 * Ids in `claimed` belong to fields resolved earlier and are skipped.
 */
export function resolveRefs(
  refs: SuggestedRef[],
  tagged: TaggedText,
  expectSelectionMark: boolean,
  claimed: ReadonlySet<string>,
): ResolvedRefs | null {
  if (refs.length === 0) return null;

  if (expectSelectionMark) {
    if (refs.length !== 1) return null;
    const target = tagged.tags.get(refs[0].tag.trim());
    if (!target || target.kind !== "selectionMark" || claimed.has(target.id)) {
      return null;
    }
    const element = tagged.elements.get(target.id);
    if (!element) return null;
    return {
      elementIds: [target.id],
      value: target.state,
      pageNumber: target.pageNumber,
      polygon: element.polygon,
    };
  }

  const picked: ElementInfo[] = [];
  const values: string[] = [];
  const taken = new Set(claimed);
  for (const ref of refs) {
    const target = tagged.tags.get(ref.tag.trim());
    if (!target || target.kind === "selectionMark") return null;
    const wanted = normalizeForMatch(ref.text);
    if (wanted.length === 0) return null;
    const candidates: CandidateWord[] = target.wordIds.flatMap((id) => {
      const element = tagged.elements.get(id);
      return element
        ? [{ id, norm: normalizeForMatch(element.content), element }]
        : [];
    });
    const run = findRun(candidates, wanted, taken);
    if (!run) return null;
    const words = candidates.slice(run[0], run[1] + 1);
    for (const word of words) {
      picked.push(word.element);
      taken.add(word.id);
    }
    values.push(words.map((word) => word.element.content).join(" "));
  }

  return {
    elementIds: picked.map((element) => element.id),
    value: values.join(" "),
    pageNumber: picked[0].pageNumber,
    polygon: unionRect(picked.map((element) => element.polygon)),
  };
}

/**
 * The first free run of words whose joined text equals `target`; failing
 * that, the shortest free run whose joined text contains it.
 */
function findRun(
  words: CandidateWord[],
  target: string,
  taken: ReadonlySet<string>,
): [number, number] | null {
  const free = (start: number, end: number): boolean =>
    words.slice(start, end + 1).every((word) => !taken.has(word.id));

  for (let start = 0; start < words.length; start += 1) {
    let joined = "";
    for (let end = start; end < words.length; end += 1) {
      joined = end === start ? words[end].norm : `${joined} ${words[end].norm}`;
      if (joined.length > target.length) break;
      if (joined === target && free(start, end)) return [start, end];
    }
  }

  let best: [number, number] | null = null;
  for (let start = 0; start < words.length; start += 1) {
    let joined = "";
    for (let end = start; end < words.length; end += 1) {
      joined = end === start ? words[end].norm : `${joined} ${words[end].norm}`;
      if (joined.includes(target)) {
        if (
          free(start, end) &&
          (best === null || end - start < best[1] - best[0])
        ) {
          best = [start, end];
        }
        break;
      }
    }
  }
  return best;
}

function unionRect(polygons: number[][]): number[] {
  const xs = polygons.flatMap((polygon) =>
    polygon.filter((_, i) => i % 2 === 0),
  );
  const ys = polygons.flatMap((polygon) =>
    polygon.filter((_, i) => i % 2 === 1),
  );
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
}
