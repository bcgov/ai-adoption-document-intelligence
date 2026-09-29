import * as fs from "node:fs";
import * as path from "node:path";
import type { AnalysisResponse, AnalysisResult } from "@/ocr/azure-types";

/** The backend's shared OCR and label fixtures (one filled 74-field form). */
export const FIXTURES_DIR = path.join(__dirname, "../../test/fixtures");

/** Layout result of the fixture form in test/fixtures/ocr_output.json. */
export function loadFixtureAnalyzeResult(): AnalysisResult {
  const raw = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, "ocr_output.json"), "utf-8"),
  ) as { labeling_document: { ocr_result: AnalysisResponse } };
  const result = raw.labeling_document.ocr_result.analyzeResult;
  if (!result) {
    throw new Error("ocr_output.json has no analyzeResult");
  }
  return result;
}

/**
 * A one-page layout result small enough to assert exact output against: the
 * line "Name Jane Doe", a ticked checkbox, then the line "Yes".
 * Content offsets: Name 0-4, Jane 5-9, Doe 10-13, ":selected:" 14-24, Yes 25-28.
 */
export function syntheticLayoutResult(): AnalysisResult {
  const content = "Name Jane Doe\n:selected: Yes";
  return {
    apiVersion: "2024-11-30",
    modelId: "prebuilt-layout",
    stringIndexType: "textElements",
    content,
    contentFormat: "text",
    pages: [
      {
        pageNumber: 1,
        angle: 0,
        width: 8.5,
        height: 11,
        unit: "inch",
        spans: [{ offset: 0, length: content.length }],
        words: [
          {
            content: "Name",
            polygon: [0, 0, 1, 0, 1, 1, 0, 1],
            confidence: 1,
            span: { offset: 0, length: 4 },
          },
          {
            content: "Jane",
            polygon: [2, 0, 3, 0, 3, 1, 2, 1],
            confidence: 1,
            span: { offset: 5, length: 4 },
          },
          {
            content: "Doe",
            polygon: [4, 0, 5, 0, 5, 1, 4, 1],
            confidence: 1,
            span: { offset: 10, length: 3 },
          },
          {
            content: "Yes",
            polygon: [2, 2, 3, 2, 3, 3, 2, 3],
            confidence: 1,
            span: { offset: 25, length: 3 },
          },
        ],
        selectionMarks: [
          {
            state: "selected",
            polygon: [0, 2, 1, 2, 1, 3, 0, 3],
            confidence: 1,
            span: { offset: 14, length: 10 },
          },
        ],
        lines: [
          {
            content: "Name Jane Doe",
            polygon: [0, 0, 5, 0, 5, 1, 0, 1],
            spans: [{ offset: 0, length: 13 }],
          },
          {
            content: "Yes",
            polygon: [2, 2, 3, 2, 3, 3, 2, 3],
            spans: [{ offset: 25, length: 3 }],
          },
        ],
      },
    ],
    tables: [],
    paragraphs: [],
    styles: [],
    sections: [],
    figures: [],
  };
}
