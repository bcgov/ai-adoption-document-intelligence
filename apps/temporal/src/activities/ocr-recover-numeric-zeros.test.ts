import type { OCRResult, Page, SelectionMark, TableCell } from "../types";

jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  }),
}));

import {
  type RecoverNumericZerosFromCheckboxesParams,
  recoverNumericZerosFromCheckboxes,
} from "./ocr-recover-numeric-zeros";

function rectPolygon(x1: number, y1: number, x2: number, y2: number): number[] {
  return [x1, y1, x2, y1, x2, y2, x1, y2];
}

function makeCell(
  rowIndex: number,
  columnIndex: number,
  content: string,
  bbox: [number, number, number, number] = [0, 0, 10, 10],
  kind?: TableCell["kind"],
): TableCell {
  return {
    rowIndex,
    columnIndex,
    content,
    kind,
    boundingRegions: [{ pageNumber: 1, polygon: rectPolygon(...bbox) }],
    spans: [],
  };
}

function makeMark(
  state: "selected" | "unselected",
  bbox: [number, number, number, number],
): SelectionMark {
  return {
    state,
    polygon: rectPolygon(...bbox),
    confidence: 0.9,
    span: { offset: 0, length: 12 },
  };
}

function makePage(selectionMarks: SelectionMark[] = []): Page {
  return {
    pageNumber: 1,
    width: 1000,
    height: 1000,
    unit: "pixel",
    words: [],
    lines: [],
    spans: [],
    selectionMarks,
  };
}

function makeOcrResult(opts: {
  cells: TableCell[];
  fields: Record<string, Record<string, unknown>>;
  marks?: SelectionMark[];
}): OCRResult {
  return {
    success: true,
    status: "succeeded",
    apimRequestId: "test",
    fileName: "doc.pdf",
    fileType: "pdf",
    modelId: "custom",
    extractedText: "",
    pages: [makePage(opts.marks ?? [])],
    tables: [
      {
        rowCount: 4,
        columnCount: 3,
        cells: opts.cells,
        boundingRegions: [],
        spans: [],
      },
    ],
    paragraphs: [],
    keyValuePairs: [],
    sections: [],
    figures: [],
    documents: [
      {
        docType: "test",
        fields: opts.fields as never,
      },
    ],
    processedAt: new Date().toISOString(),
  };
}

const sdprIncomeConfig: RecoverNumericZerosFromCheckboxesParams = {
  ocrResult: undefined as unknown as OCRResult, // filled in per-test
  tables: [
    {
      find: { firstCellTextContains: "Declare all income" },
      columns: [
        { prefix: "applicant_", headerEquals: "Applicant" },
        { prefix: "spouse_", headerEquals: "Spouse" },
      ],
      rows: [
        {
          suffix: "net_employment_income",
          labelEquals: "Net Employment Income",
        },
        { suffix: "rental_income", labelEquals: "Rental Income" },
      ],
    },
  ],
};

describe("recoverNumericZerosFromCheckboxes", () => {
  it("recovers $0 in cells with $ + :unselected: marker and overlapping selection mark", async () => {
    const cells: TableCell[] = [
      makeCell(
        0,
        0,
        "2. Declare all income and submit proof.",
        [0, 0, 100, 10],
        "columnHeader",
      ),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(1, 2, "Spouse", [70, 10, 90, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$ :unselected:", [50, 20, 70, 30]),
      makeCell(2, 2, "$ :unselected:", [70, 20, 90, 30]),
      makeCell(3, 0, "Rental Income", [0, 30, 50, 40]),
      makeCell(3, 1, "$ :selected: :unselected:", [50, 30, 70, 40]),
      makeCell(3, 2, "$1500", [70, 30, 90, 40]),
    ];
    const marks: SelectionMark[] = [
      makeMark("unselected", [55, 22, 60, 27]),
      makeMark("unselected", [75, 22, 80, 27]),
      makeMark("selected", [55, 32, 60, 37]),
      makeMark("unselected", [62, 32, 67, 37]),
      // no mark inside row 3 spouse cell -> real-number cell, should be left alone anyway
    ];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number", confidence: 0.33 },
      spouse_net_employment_income: { type: "number", confidence: 0.31 },
      applicant_rental_income: { type: "number", confidence: 0.4 },
      spouse_rental_income: {
        type: "number",
        confidence: 0.98,
        valueNumber: 1500,
        content: "1500",
        valueString: "1500",
      },
    };
    const ocrResult = makeOcrResult({ cells, fields, marks });

    const out = await recoverNumericZerosFromCheckboxes({
      ...sdprIncomeConfig,
      ocrResult,
    });

    const recovered = out.ocrResult.documents?.[0]?.fields;
    expect(recovered).toBeDefined();
    if (!recovered) throw new Error("missing");
    expect(recovered.applicant_net_employment_income.valueNumber).toBe(0);
    expect(recovered.applicant_net_employment_income.content).toBe("0");
    expect(recovered.applicant_net_employment_income.valueString).toBe("0");
    expect(recovered.spouse_net_employment_income.valueNumber).toBe(0);
    expect(recovered.applicant_rental_income.valueNumber).toBe(0);
    // populated field must be untouched
    expect(recovered.spouse_rental_income.valueNumber).toBe(1500);
    expect(recovered.spouse_rental_income.content).toBe("1500");

    expect(out.metadata?.applied).toBe(3);
    expect(out.changes).toHaveLength(3);
    expect(out.changes[0].source).toBe("rule");
    expect(out.changes[0].correctedValue).toBe("0");
  });

  it("skips cells with digits — does not overwrite real numbers", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10], "columnHeader"),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(1, 2, "Spouse", [70, 10, 90, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$1234", [50, 20, 70, 30]),
      makeCell(2, 2, "$2000.50", [70, 20, 90, 30]),
    ];
    const marks = [makeMark("unselected", [55, 22, 60, 27])]; // overlaps applicant cell even with digits
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number", confidence: 0.4 },
      spouse_net_employment_income: { type: "number", confidence: 0.4 },
    };
    const ocrResult = makeOcrResult({ cells, fields, marks });

    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [
            { prefix: "applicant_", headerEquals: "Applicant" },
            { prefix: "spouse_", headerEquals: "Spouse" },
          ],
          rows: [
            {
              suffix: "net_employment_income",
              labelEquals: "Net Employment Income",
            },
          ],
        },
      ],
    });

    const f = out.ocrResult.documents?.[0]?.fields;
    if (!f) throw new Error("missing");
    expect(f.applicant_net_employment_income.valueNumber).toBeUndefined();
    expect(f.spouse_net_employment_income.valueNumber).toBeUndefined();
    expect(out.metadata?.applied).toBe(0);
  });

  it("skips cells without an overlapping selection mark when requireMark is true (default)", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10], "columnHeader"),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$", [50, 20, 70, 30]),
    ];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number", confidence: 0.3 },
    };
    const ocrResult = makeOcrResult({ cells, fields, marks: [] });

    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [{ prefix: "applicant_", headerEquals: "Applicant" }],
          rows: [
            {
              suffix: "net_employment_income",
              labelEquals: "Net Employment Income",
            },
          ],
        },
      ],
    });

    const f = out.ocrResult.documents?.[0]?.fields;
    if (!f) throw new Error("missing");
    expect(f.applicant_net_employment_income.valueNumber).toBeUndefined();
    expect(out.metadata?.applied).toBe(0);
    expect(
      (out.metadata?.skippedByReason as Record<string, number>)[
        "no_selection_mark_in_cell"
      ],
    ).toBe(1);
  });

  it("recovers cells regardless of mark state (selected vs unselected) since Azure flips them", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10], "columnHeader"),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$ :selected:", [50, 20, 70, 30]),
    ];
    const marks = [makeMark("selected", [55, 22, 60, 27])];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number", confidence: 0.3 },
    };
    const ocrResult = makeOcrResult({ cells, fields, marks });

    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [{ prefix: "applicant_", headerEquals: "Applicant" }],
          rows: [
            {
              suffix: "net_employment_income",
              labelEquals: "Net Employment Income",
            },
          ],
        },
      ],
    });

    const f = out.ocrResult.documents?.[0]?.fields;
    if (!f) throw new Error("missing");
    expect(f.applicant_net_employment_income.valueNumber).toBe(0);
  });

  it("no-ops with empty tables config", async () => {
    const ocrResult = makeOcrResult({
      cells: [],
      fields: { applicant_x: { type: "number" } },
    });
    const out = await recoverNumericZerosFromCheckboxes({ ocrResult });
    expect(out.metadata?.applied).toBe(0);
    expect(out.changes).toHaveLength(0);
  });

  it("no-ops when target table is not found", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Unrelated table", [0, 0, 100, 10]),
    ];
    const ocrResult = makeOcrResult({
      cells,
      fields: { applicant_x: { type: "number" } },
      marks: [],
    });
    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [{ prefix: "applicant_", headerEquals: "Applicant" }],
          rows: [{ suffix: "x", labelEquals: "X" }],
        },
      ],
    });
    expect(out.metadata?.applied).toBe(0);
  });

  it("no-ops when documents[0] is missing", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10]),
    ];
    const ocrResult: OCRResult = {
      ...makeOcrResult({ cells, fields: {}, marks: [] }),
      documents: [],
    };
    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [{ prefix: "applicant_", headerEquals: "Applicant" }],
          rows: [{ suffix: "x", labelEquals: "X" }],
        },
      ],
    });
    expect(out.metadata?.applied).toBe(0);
  });

  it("records unresolved row/column selectors in metadata", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10]),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$ :unselected:", [50, 20, 70, 30]),
    ];
    const marks = [makeMark("unselected", [55, 22, 60, 27])];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number" },
    };
    const ocrResult = makeOcrResult({ cells, fields, marks });
    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [
            { prefix: "applicant_", headerEquals: "Applicant" },
            { prefix: "spouse_", headerEquals: "Spouse" }, // no column header matches
          ],
          rows: [
            {
              suffix: "net_employment_income",
              labelEquals: "Net Employment Income",
            },
            { suffix: "rental_income", labelEquals: "Rental Income" }, // no row label matches
          ],
        },
      ],
    });
    expect(out.metadata?.applied).toBe(1);
    expect(out.metadata?.unresolved).toBe(2);
    const unresolvedSelectors = out.metadata?.unresolvedSelectors as string[];
    expect(unresolvedSelectors).toEqual(
      expect.arrayContaining(["column:spouse_", "row:rental_income"]),
    );
  });

  it("preserves the original ocrResult (does not mutate input)", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10]),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$ :unselected:", [50, 20, 70, 30]),
    ];
    const marks = [makeMark("unselected", [55, 22, 60, 27])];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number" },
    };
    const ocrResult = makeOcrResult({ cells, fields, marks });
    const before = JSON.stringify(ocrResult);
    await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [{ prefix: "applicant_", headerEquals: "Applicant" }],
          rows: [
            {
              suffix: "net_employment_income",
              labelEquals: "Net Employment Income",
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(ocrResult)).toBe(before);
  });

  it("supports custom recoveryValue and custom stripBeforeCheck tokens", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Hours table", [0, 0, 100, 10]),
      makeCell(1, 1, "Mon", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Lunch", [0, 20, 50, 30]),
      makeCell(2, 1, "hr [empty]", [50, 20, 70, 30]),
    ];
    const marks = [makeMark("unselected", [55, 22, 60, 27])];
    const fields: Record<string, Record<string, unknown>> = {
      mon_lunch: { type: "number" },
    };
    const ocrResult = makeOcrResult({ cells, fields, marks });
    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Hours table" },
          columns: [{ prefix: "mon_", headerEquals: "Mon" }],
          rows: [{ suffix: "lunch", labelEquals: "Lunch" }],
          recoveryValue: 8,
          cellEligibility: { stripBeforeCheck: ["hr", "[empty]"] },
        },
      ],
    });
    const f = out.ocrResult.documents?.[0]?.fields;
    if (!f) throw new Error("missing");
    expect(f.mon_lunch.valueNumber).toBe(8);
    expect(f.mon_lunch.content).toBe("8");
  });

  it("skips cell that does not overlap selection mark even when content is mark-only", async () => {
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10]),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$ :unselected:", [50, 20, 70, 30]),
    ];
    // mark far outside the cell
    const marks = [makeMark("unselected", [900, 900, 950, 950])];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number" },
    };
    const ocrResult = makeOcrResult({ cells, fields, marks });
    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [{ prefix: "applicant_", headerEquals: "Applicant" }],
          rows: [
            {
              suffix: "net_employment_income",
              labelEquals: "Net Employment Income",
            },
          ],
        },
      ],
    });
    expect(out.metadata?.applied).toBe(0);
    expect(
      (out.metadata?.skippedByReason as Record<string, number>)[
        "no_selection_mark_in_cell"
      ],
    ).toBe(1);
  });
});
