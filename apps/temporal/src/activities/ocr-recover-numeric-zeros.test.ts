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

  // -------------------------------------------------------------------------
  // Group A — label-anchor fallback (when title isn't found in r0c0)
  // -------------------------------------------------------------------------

  it("Group A: falls back to row-label anchor when the title r0c0 doesn't match", async () => {
    // 18-row, 3-col candidate table where r0c0 is *blank* (Azure dropped the
    // "Declare all income" title), but column 0 contains the printed row
    // labels. Should be located by the label-anchor finder.
    const cells: TableCell[] = [
      // r0c0 = blank (no title)
      makeCell(0, 0, "", [0, 0, 50, 10]),
      makeCell(0, 1, "", [50, 0, 70, 10]),
      makeCell(0, 2, "", [70, 0, 90, 10]),
    ];
    const labels = [
      "Net Employment Income",
      "Employment Insurance",
      "Spousal Support / Alimony",
      "Child Support",
      "WorkBC Financial Support",
      "Student Funding (eg: Loans, Bursaries)",
      "Rental Income",
      "Room / Board Income",
      "Worker's Compensation",
      "Private Pensions (eg: Retirement, Disability)",
      "OAS / GIS",
      "Trust Income",
    ];
    labels.forEach((label, i) => {
      const y = 10 + i * 10;
      cells.push(makeCell(i + 1, 0, label, [0, y, 50, y + 10]));
      cells.push(makeCell(i + 1, 1, "$ :unselected:", [50, y, 70, y + 10]));
      cells.push(makeCell(i + 1, 2, "$ :unselected:", [70, y, 90, y + 10]));
    });
    // Selection marks overlapping every value cell (so eligibility passes)
    const marks: SelectionMark[] = [];
    labels.forEach((_label, i) => {
      const y = 10 + i * 10;
      marks.push(makeMark("unselected", [55, y + 2, 60, y + 8]));
      marks.push(makeMark("unselected", [75, y + 2, 80, y + 8]));
    });
    const fields: Record<string, Record<string, unknown>> = {};
    labels.forEach((label) => {
      const suffix = label
        .toLowerCase()
        .replace(/[()/'.]/g, "")
        .replace(/eg:/g, "")
        .replace(/[ ,]+/g, "_");
      fields[`applicant_${suffix}`] = { type: "number" };
      fields[`spouse_${suffix}`] = { type: "number" };
    });

    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "doc.pdf",
      fileType: "pdf",
      modelId: "custom",
      extractedText: "",
      pages: [makePage(marks)],
      tables: [
        {
          rowCount: labels.length + 1,
          columnCount: 3,
          cells,
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
          fields: fields as never,
        },
      ],
      processedAt: new Date().toISOString(),
    };

    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [
            { prefix: "applicant_", headerEquals: "Applicant" },
            { prefix: "spouse_", headerEquals: "Spouse" },
          ],
          rows: labels.map((label) => ({
            suffix: label
              .toLowerCase()
              .replace(/[()/'.]/g, "")
              .replace(/eg:/g, "")
              .replace(/[ ,]+/g, "_"),
            labelEquals: label,
          })),
          fallbackTableFinder: {
            shape: {
              minRowCount: 12,
              maxRowCount: 22,
              minColumnCount: 2,
              maxColumnCount: 3,
            },
            labelAnchor: { minLabelMatches: 10 },
          },
        },
      ],
    });

    // Title would not have located the table; label-anchor must have fired.
    expect(
      (out.metadata?.tableFinderStrategy as Record<string, string>).config_0,
    ).toBe("label-anchor");
    // 12 label rows × 2 columns = 24 candidate cells, but the column map
    // depends on the header matcher. In this fixture there is no Applicant /
    // Spouse header row, so columnMap is empty and recoveries land on 0
    // cells. We assert the table-finder strategy fired regardless — the
    // column-resolution failure is logged via unresolved selectors.
    expect(
      (out.metadata?.unresolvedSelectors as string[]).filter((s) =>
        s.startsWith("column:"),
      ).length,
    ).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Group B — positional-anchor fallback (when title AND row labels miss)
  // -------------------------------------------------------------------------

  it("Group B: maps rows via offset-vote on label paragraphs when col 0 has no labels", async () => {
    // 19-row, 2-col candidate table where column 0 is value cells (not
    // labels). Row labels exist as paragraphs on the page (matched via
    // loose substring). The offset-vote tally should agree on a single
    // offset and the column map should fall out of left-to-right midX.
    const labels = [
      "Net Employment Income",
      "Employment Insurance",
      "Spousal Support / Alimony",
      "Child Support",
      "WorkBC Financial Support",
      "Student Funding (eg: Loans, Bursaries)",
      "Rental Income",
      "Room / Board Income",
      "Worker's Compensation",
      "Private Pensions (eg: Retirement, Disability)",
      "OAS / GIS",
      "Trust Income",
      "Canada Pension Plan (CPP)",
      "Tax Credits (eg: GST Credit)",
      "Child Tax Benefits",
      "Income Tax Refund",
      "All other income / money received",
      "Income of Dependent Children",
    ];
    const cells: TableCell[] = [];
    // 19 rows of value-only cells (no row 0 header in the table)
    for (let r = 0; r < 19; r++) {
      const y = 100 + r * 20;
      cells.push(makeCell(r, 0, "$ :unselected:", [600, y, 700, y + 18]));
      cells.push(makeCell(r, 1, "$ :unselected:", [750, y, 800, y + 18]));
    }
    // Selection marks overlapping every cell
    const marks: SelectionMark[] = [];
    for (let r = 0; r < 19; r++) {
      const y = 100 + r * 20;
      marks.push(makeMark("unselected", [620, y + 5, 640, y + 15]));
      marks.push(makeMark("unselected", [770, y + 5, 790, y + 15]));
    }
    // Row-label paragraphs sit on the page at midY values that align with
    // the candidate table's rows 1..18 (so the dominant offset = -1).
    const paragraphs = labels.map((label, i) => {
      const tableRow = i + 1; // label_index 0 → table row 1
      const y = 100 + tableRow * 20;
      return {
        content: label,
        boundingRegions: [
          { pageNumber: 1, polygon: rectPolygon(50, y + 4, 500, y + 16) },
        ],
        spans: [],
      };
    });
    const fields: Record<string, Record<string, unknown>> = {};
    const rowsCfg = labels.map((label) => {
      const suffix = label
        .toLowerCase()
        .replace(/[()/'.]/g, "")
        .replace(/eg:/g, "")
        .replace(/[ ,]+/g, "_");
      fields[`applicant_${suffix}`] = { type: "number" };
      fields[`spouse_${suffix}`] = { type: "number" };
      return { suffix, labelEquals: label };
    });

    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "doc.pdf",
      fileType: "pdf",
      modelId: "custom",
      extractedText: "",
      pages: [makePage(marks)],
      tables: [
        {
          rowCount: 19,
          columnCount: 2,
          cells,
          boundingRegions: [],
          spans: [],
        },
      ],
      paragraphs,
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [
        {
          docType: "test",
          fields: fields as never,
        },
      ],
      processedAt: new Date().toISOString(),
    };

    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [
            { prefix: "applicant_", headerEquals: "Applicant" },
            { prefix: "spouse_", headerEquals: "Spouse" },
          ],
          rows: rowsCfg,
          fallbackTableFinder: {
            shape: {
              minRowCount: 18,
              maxRowCount: 21,
              minColumnCount: 2,
              maxColumnCount: 3,
            },
            labelAnchor: { minLabelMatches: 12 },
            positionalAnchor: { minVotes: 3, dominanceRatio: 2.0 },
          },
        },
      ],
    });

    expect(
      (out.metadata?.tableFinderStrategy as Record<string, string>).config_0,
    ).toBe("positional-anchor");
    // 18 label rows × 2 columns × all-eligible cells = 36 recoveries.
    expect(out.metadata?.applied).toBe(36);
    expect(
      (out.metadata?.appliedByStrategy as Record<string, number>)[
        "positional-anchor"
      ],
    ).toBe(36);
    const recoveredFields = out.ocrResult.documents?.[0]?.fields;
    expect(recoveredFields).toBeDefined();
    if (!recoveredFields) throw new Error("missing");
    expect(recoveredFields.applicant_net_employment_income.valueNumber).toBe(0);
    expect(recoveredFields.spouse_net_employment_income.valueNumber).toBe(0);
    expect(
      recoveredFields.applicant_income_of_dependent_children.valueNumber,
    ).toBe(0);
    expect(
      recoveredFields.spouse_income_of_dependent_children.valueNumber,
    ).toBe(0);
  });

  it("Group B: skips when offset-vote has no dominant winner", async () => {
    // A pathological candidate where the row-label Y positions don't align
    // with the table rows in any consistent way — votes split across many
    // offsets and the dominance gate refuses to commit.
    const cells: TableCell[] = [];
    for (let r = 0; r < 19; r++) {
      const y = 100 + r * 20;
      cells.push(makeCell(r, 0, "$ :unselected:", [600, y, 700, y + 18]));
      cells.push(makeCell(r, 1, "$ :unselected:", [750, y, 800, y + 18]));
    }
    const marks: SelectionMark[] = [];
    for (let r = 0; r < 19; r++) {
      const y = 100 + r * 20;
      marks.push(makeMark("unselected", [620, y + 5, 640, y + 15]));
    }
    // Only 2 label paragraphs, at very different offsets → top_votes=1, below threshold.
    const paragraphs = [
      {
        content: "Net Employment Income",
        boundingRegions: [
          { pageNumber: 1, polygon: rectPolygon(50, 100, 500, 116) },
        ],
        spans: [],
      },
      {
        content: "OAS / GIS",
        boundingRegions: [
          { pageNumber: 1, polygon: rectPolygon(50, 500, 500, 516) },
        ],
        spans: [],
      },
    ];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number" },
      applicant_oas_gis: { type: "number" },
    };
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "doc.pdf",
      fileType: "pdf",
      modelId: "custom",
      extractedText: "",
      pages: [makePage(marks)],
      tables: [
        {
          rowCount: 19,
          columnCount: 2,
          cells,
          boundingRegions: [],
          spans: [],
        },
      ],
      paragraphs,
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [{ docType: "test", fields: fields as never }],
      processedAt: new Date().toISOString(),
    };
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
            { suffix: "oas_gis", labelEquals: "OAS / GIS" },
          ],
          fallbackTableFinder: {
            shape: {
              minRowCount: 18,
              maxRowCount: 21,
              minColumnCount: 2,
              maxColumnCount: 3,
            },
            positionalAnchor: { minVotes: 3, dominanceRatio: 2.0 },
          },
        },
      ],
    });
    // Title misses (no r0c0 match), label-anchor not configured + col0 has no
    // labels, positional anchor below min_votes threshold → no flips.
    expect(
      (out.metadata?.tableFinderStrategy as Record<string, string>).config_0,
    ).toBe("not-found");
    expect(out.metadata?.applied).toBe(0);
  });

  it("Group B: 19×3 candidate with a pure-currency column gets that column dropped", async () => {
    // 19×3 with col 0 = '$' only, col 1 = applicant values, col 2 = spouse
    // values. Column count > prefix count → the pure-currency column 0 is
    // dropped, leaving (col 1, col 2) mapped to (applicant_, spouse_).
    const cells: TableCell[] = [];
    for (let r = 0; r < 19; r++) {
      const y = 100 + r * 20;
      cells.push(makeCell(r, 0, "$", [500, y, 540, y + 18])); // pure currency
      cells.push(makeCell(r, 1, "$ :unselected:", [600, y, 700, y + 18]));
      cells.push(makeCell(r, 2, "$ :unselected:", [750, y, 800, y + 18]));
    }
    const marks: SelectionMark[] = [];
    for (let r = 0; r < 19; r++) {
      const y = 100 + r * 20;
      marks.push(makeMark("unselected", [620, y + 5, 640, y + 15]));
      marks.push(makeMark("unselected", [770, y + 5, 790, y + 15]));
    }
    const labels = [
      "Net Employment Income",
      "Employment Insurance",
      "Spousal Support / Alimony",
      "Child Support",
      "WorkBC Financial Support",
      "Student Funding (eg: Loans, Bursaries)",
      "Rental Income",
      "Room / Board Income",
      "Worker's Compensation",
      "Private Pensions (eg: Retirement, Disability)",
      "OAS / GIS",
      "Trust Income",
      "Canada Pension Plan (CPP)",
      "Tax Credits (eg: GST Credit)",
      "Child Tax Benefits",
      "Income Tax Refund",
      "All other income / money received",
      "Income of Dependent Children",
    ];
    const paragraphs = labels.map((label, i) => {
      const tableRow = i + 1;
      const y = 100 + tableRow * 20;
      return {
        content: label,
        boundingRegions: [
          { pageNumber: 1, polygon: rectPolygon(50, y + 4, 480, y + 16) },
        ],
        spans: [],
      };
    });
    const fields: Record<string, Record<string, unknown>> = {};
    const rowsCfg = labels.map((label) => {
      const suffix = label
        .toLowerCase()
        .replace(/[()/'.]/g, "")
        .replace(/eg:/g, "")
        .replace(/[ ,]+/g, "_");
      fields[`applicant_${suffix}`] = { type: "number" };
      fields[`spouse_${suffix}`] = { type: "number" };
      return { suffix, labelEquals: label };
    });

    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "doc.pdf",
      fileType: "pdf",
      modelId: "custom",
      extractedText: "",
      pages: [makePage(marks)],
      tables: [
        {
          rowCount: 19,
          columnCount: 3,
          cells,
          boundingRegions: [],
          spans: [],
        },
      ],
      paragraphs,
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [{ docType: "test", fields: fields as never }],
      processedAt: new Date().toISOString(),
    };

    const out = await recoverNumericZerosFromCheckboxes({
      ocrResult,
      tables: [
        {
          find: { firstCellTextContains: "Declare all income" },
          columns: [
            { prefix: "applicant_", headerEquals: "Applicant" },
            { prefix: "spouse_", headerEquals: "Spouse" },
          ],
          rows: rowsCfg,
          fallbackTableFinder: {
            shape: {
              minRowCount: 18,
              maxRowCount: 21,
              minColumnCount: 2,
              maxColumnCount: 3,
            },
            positionalAnchor: { minVotes: 3, dominanceRatio: 2.0 },
          },
        },
      ],
    });

    expect(
      (out.metadata?.tableFinderStrategy as Record<string, string>).config_0,
    ).toBe("positional-anchor");
    expect(out.metadata?.applied).toBe(36);
  });

  // -------------------------------------------------------------------------
  // Self-fix #1 — accept cells where stripped content parses to recoveryValue
  // -------------------------------------------------------------------------

  it("Self-fix #1: recovers '$ 0' cells where Azure saw both the digit AND a selection mark", async () => {
    // Cell content looks like '$ 0\n:selected:' — Azure DI's layout step
    // recognized both the 0 digit AND a stray selection mark in the same
    // cell. Original rule rejected because of the digit; new rule accepts
    // since the digit IS the recovery value AND a mark overlaps the cell.
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10], "columnHeader"),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$ 0\n:selected:", [50, 20, 70, 30]),
      makeCell(3, 0, "Rental Income", [0, 30, 50, 40]),
      makeCell(3, 1, "$ 0.00", [50, 30, 70, 40]),
    ];
    // Both cells have an overlapping selection mark (required by the
    // existing eligibility gate, which Self-fix #1 does not relax).
    const marks: SelectionMark[] = [
      makeMark("selected", [55, 22, 60, 27]),
      makeMark("unselected", [55, 32, 60, 37]),
    ];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number", confidence: 0.3 },
      applicant_rental_income: { type: "number", confidence: 0.5 },
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
            { suffix: "rental_income", labelEquals: "Rental Income" },
          ],
        },
      ],
    });

    const recovered = out.ocrResult.documents?.[0]?.fields;
    if (!recovered) throw new Error("missing");
    expect(recovered.applicant_net_employment_income.valueNumber).toBe(0);
    expect(recovered.applicant_rental_income.valueNumber).toBe(0);
    expect(out.metadata?.applied).toBe(2);
  });

  it("Self-fix #1: a '$ 0' cell with NO overlapping mark is still rejected", async () => {
    // The new rule widens content eligibility but does NOT relax the
    // selection-mark requirement. A '$ 0' cell with zero overlapping marks
    // must remain rejected — that's a "model missed a recognized 0" pattern,
    // not a "checkbox-as-zero" pattern.
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10], "columnHeader"),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$ 0", [50, 20, 70, 30]),
    ];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number", confidence: 0.5 },
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

    expect(out.metadata?.applied).toBe(0);
    expect(
      (out.metadata?.skippedByReason as Record<string, number>)[
        "no_selection_mark_in_cell"
      ],
    ).toBe(1);
  });

  it("Self-fix #1: non-zero digit cells are still rejected even with overlapping mark", async () => {
    // Cell content '$ 5' with a mark overlap: stripped='5' parses to 5, not
    // 0 (the recoveryValue), so eligibility still fails. Critical: this
    // protects against turning real-value cells into 0.
    const cells: TableCell[] = [
      makeCell(0, 0, "Declare all income", [0, 0, 100, 10], "columnHeader"),
      makeCell(1, 1, "Applicant", [50, 10, 70, 20], "columnHeader"),
      makeCell(2, 0, "Net Employment Income", [0, 20, 50, 30]),
      makeCell(2, 1, "$ 5", [50, 20, 70, 30]),
    ];
    const marks = [makeMark("unselected", [55, 22, 60, 27])];
    const fields: Record<string, Record<string, unknown>> = {
      applicant_net_employment_income: { type: "number", confidence: 0.5 },
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
        "cell_has_digits_or_letters"
      ],
    ).toBe(1);
  });
});
