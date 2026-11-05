import type { AnalysisResult } from "../../../src/ocr/azure-types";
import type { AnswerField, AnswerKey } from "./fill";

/** Slack around a field's rectangle, in normalised page units. */
const TOLERANCE = 0.005;

export interface TruthField {
  key: string;
  type: "string" | "selectionMark";
  /** False when no location's OCR reads back the value (clipped or split text). */
  verified: boolean;
  /** One element-id list per location that verified; any one of them is a correct label. */
  alternatives: string[][];
}

export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function centre(polygon: number[]): [number, number] {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

function truthFor(field: AnswerField, result: AnalysisResult): TruthField {
  const alternatives: string[][] = [];
  for (const location of field.locations) {
    const page = result.pages.find((p) => p.pageNumber === location.page);
    if (!page) continue;
    const [left, top, right, bottom] = location.rect;
    const inside = (polygon: number[]): boolean => {
      const [x, y] = centre(polygon);
      const nx = x / page.width;
      const ny = y / page.height;
      return (
        nx >= left - TOLERANCE &&
        nx <= right + TOLERANCE &&
        ny >= top - TOLERANCE &&
        ny <= bottom + TOLERANCE
      );
    };
    if (field.type === "selectionMark") {
      const marks = (page.selectionMarks ?? [])
        .map((mark, index) => ({ mark, id: `p${page.pageNumber}-sm${index}` }))
        .filter(
          ({ mark }) => mark.polygon?.length >= 8 && inside(mark.polygon),
        );
      if (marks.length === 1 && marks[0].mark.state === field.value) {
        alternatives.push([marks[0].id]);
      }
    } else {
      const words = (page.words ?? [])
        .map((word, index) => ({ word, id: `p${page.pageNumber}-w${index}` }))
        .filter(
          ({ word }) => word.polygon?.length >= 8 && inside(word.polygon),
        );
      const read = normalizeText(
        words.map(({ word }) => word.content).join(" "),
      );
      if (words.length > 0 && read === normalizeText(field.value)) {
        alternatives.push(words.map(({ id }) => id));
      }
    }
  }
  return {
    key: field.key,
    type: field.type,
    verified: alternatives.length > 0,
    alternatives,
  };
}

export function buildTruth(
  answers: AnswerKey,
  result: AnalysisResult,
): TruthField[] {
  return answers.fields.map((field) => truthFor(field, result));
}
