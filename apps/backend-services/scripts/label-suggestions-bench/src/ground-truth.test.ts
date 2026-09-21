import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisResult } from "../../../src/ocr/azure-types";
import type { AnswerKey } from "./fill";
import { buildTruth } from "./ground-truth";

/** An 8.5 × 11 inch page with two words and one ticked checkbox. */
function ocr(): AnalysisResult {
  const box = (x: number, y: number, w: number, h: number) => [
    x,
    y,
    x + w,
    y,
    x + w,
    y + h,
    x,
    y + h,
  ];
  return {
    apiVersion: "2024-11-30",
    modelId: "prebuilt-layout",
    stringIndexType: "textElements",
    content: "Jane Doe :selected:",
    contentFormat: "text",
    pages: [
      {
        pageNumber: 1,
        angle: 0,
        width: 8.5,
        height: 11,
        unit: "inch",
        spans: [{ offset: 0, length: 19 }],
        words: [
          {
            content: "Jane",
            polygon: box(1.0, 1.0, 0.5, 0.2),
            confidence: 1,
            span: { offset: 0, length: 4 },
          },
          {
            content: "Doe",
            polygon: box(1.6, 1.0, 0.4, 0.2),
            confidence: 1,
            span: { offset: 5, length: 3 },
          },
        ],
        selectionMarks: [
          {
            state: "selected",
            polygon: box(1.0, 2.0, 0.15, 0.15),
            confidence: 1,
            span: { offset: 9, length: 10 },
          },
        ],
        lines: [],
      },
    ],
    tables: [],
    paragraphs: [],
    styles: [],
    sections: [],
    figures: [],
  };
}

function answers(nameValue: string, ticked: string): AnswerKey {
  return {
    formId: "t",
    copy: 1,
    seed: 1,
    fields: [
      {
        key: "name",
        pdfName: "Name",
        type: "string",
        value: nameValue,
        description: null,
        locations: [
          { page: 1, rect: [0.9 / 8.5, 0.95 / 11, 2.2 / 8.5, 1.25 / 11] },
        ],
      },
      {
        key: "agree",
        pdfName: "Agree",
        type: "selectionMark",
        value: ticked,
        description: null,
        locations: [
          { page: 1, rect: [0.95 / 8.5, 1.95 / 11, 1.2 / 8.5, 2.2 / 11] },
        ],
      },
    ],
  };
}

describe("buildTruth", () => {
  it("maps each field to the OCR elements inside its rectangle", () => {
    const truth = buildTruth(answers("Jane Doe", "selected"), ocr());
    assert.deepEqual(truth, [
      {
        key: "name",
        type: "string",
        verified: true,
        alternatives: [["p1-w0", "p1-w1"]],
      },
      {
        key: "agree",
        type: "selectionMark",
        verified: true,
        alternatives: [["p1-sm0"]],
      },
    ]);
  });

  it("marks a field unverifiable when the OCR does not read back its value", () => {
    const truth = buildTruth(answers("Jane Doherty", "unselected"), ocr());
    assert.equal(truth[0].verified, false);
    assert.equal(truth[1].verified, false);
  });
});
