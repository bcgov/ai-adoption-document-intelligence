import type { OCRResult } from "../types";

jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

import { buildFlatPredictionMapFromCtx } from "../azure-ocr-field-display-value";
import { getPrismaClient } from "./database-client";
import { normalizeOcrFields } from "./ocr-normalize-fields";

const getPrismaClientMock = getPrismaClient as jest.Mock;

function makeOcrResult(
  kvps: Array<{ key: string; value: string; confidence: number }>,
): OCRResult {
  return {
    success: true,
    status: "succeeded",
    apimRequestId: "test",
    fileName: "test.pdf",
    fileType: "pdf",
    modelId: "prebuilt-layout",
    extractedText: "",
    pages: [
      {
        pageNumber: 1,
        width: 1000,
        height: 1000,
        unit: "pixel",
        words: [
          {
            content: "line-\n break",
            polygon: [],
            confidence: 0.9,
            span: { offset: 0, length: 11 },
          },
        ],
        lines: [
          {
            content: "  A   line  ",
            polygon: [],
            spans: [{ offset: 0, length: 10 }],
          },
        ],
        spans: [],
      },
    ],
    tables: [
      {
        rowCount: 1,
        columnCount: 1,
        cells: [
          {
            rowIndex: 0,
            columnIndex: 0,
            content: "$ 1,234",
            boundingRegions: [],
            spans: [{ offset: 0, length: 7 }],
          },
        ],
        boundingRegions: [],
        spans: [],
      },
    ],
    paragraphs: [
      {
        content: "hello\u00A0world",
        boundingRegions: [],
        spans: [{ offset: 0, length: 11 }],
      },
    ],
    keyValuePairs: kvps.map((k) => ({
      key: { content: k.key, boundingRegions: [], spans: [] },
      value: {
        content: k.value,
        boundingRegions: [{ pageNumber: 1, polygon: [] }],
        spans: [{ offset: 0, length: 0 }],
      },
      confidence: k.confidence,
    })),
    sections: [],
    figures: [],
    processedAt: new Date().toISOString(),
  };
}

describe("normalizeOcrFields", () => {
  it("normalizes excess whitespace", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "  John   Doe  ", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("John Doe");
    expect(result.changes.length).toBe(1);
    expect(result.changes[0].reason).toContain("whitespace");
  });

  it("normalizes digit grouping with spaces", async () => {
    const ocrResult = makeOcrResult([
      { key: "Amount", value: "1 234 567", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("1234567");
  });

  it("normalizes comma thousands separators", async () => {
    const ocrResult = makeOcrResult([
      { key: "Amount", value: "1, 234,567.89", confidence: 0.9 },
    ]);
    const result = await normalizeOcrFields({ ocrResult });
    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("1234567.89");
  });

  it("normalizes date separators", async () => {
    const ocrResult = makeOcrResult([
      { key: "ShipDate", value: "01.15.2024", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("01/15/2024");
  });

  it("normalizes unicode and spacing artifacts", async () => {
    const ocrResult = makeOcrResult([
      { key: "Text", value: "hello\u00A0world", confidence: 0.9 },
    ]);
    const result = await normalizeOcrFields({ ocrResult });
    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe(
      "hello world",
    );
  });

  it("does not mutate the original", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "  hello  ", confidence: 0.9 },
    ]);
    const originalValue = ocrResult.keyValuePairs[0].value?.content;

    await normalizeOcrFields({ ocrResult });

    expect(ocrResult.keyValuePairs[0].value?.content).toBe(originalValue);
  });

  it("is idempotent", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "  John   Doe  ", confidence: 0.9 },
    ]);

    const first = await normalizeOcrFields({ ocrResult });
    const second = await normalizeOcrFields({
      ocrResult: first.ocrResult,
    });

    expect(second.ocrResult.keyValuePairs[0].value?.content).toBe("John Doe");
    expect(second.changes).toHaveLength(0);
  });

  it("respects fieldScope", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "  hello  ", confidence: 0.9 },
      { key: "Amount", value: "  world  ", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({
      ocrResult,
      fieldScope: ["Name"],
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("hello");
    expect(result.ocrResult.keyValuePairs[1].value?.content).toBe("  world  ");
  });

  it("applies numeric rules heuristically outside fieldScope", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "John Doe", confidence: 0.9 },
      { key: "Amount", value: "1,234", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({
      ocrResult,
      fieldScope: ["Name"],
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("John Doe");
    expect(result.ocrResult.keyValuePairs[1].value?.content).toBe("1234");
  });

  it("can disable specific normalizations", async () => {
    const ocrResult = makeOcrResult([
      { key: "ShipDate", value: "  01.15.2024  ", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({
      ocrResult,
      normalizeWhitespace: true,
      normalizeDateSeparators: false,
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("01.15.2024");
  });

  it("supports enabledRules selection", async () => {
    const ocrResult = makeOcrResult([
      { key: "Amount", value: "$ 1,234", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({
      ocrResult,
      enabledRules: ["currencySpacing"],
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("$1,234");
  });

  it("supports disabledRules selection", async () => {
    const ocrResult = makeOcrResult([
      { key: "Amount", value: "$ 1,234", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({
      ocrResult,
      disabledRules: ["currencySpacing"],
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("$ 1234");
  });

  it("supports normalizeFullResult", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "John", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({
      ocrResult,
      normalizeFullResult: true,
      enabledRules: [
        "dehyphenation",
        "whitespace",
        "unicode",
        "currencySpacing",
        "commaThousands",
      ],
    });

    expect(result.ocrResult.pages[0].words[0].content).toBe("linebreak");
    expect(result.ocrResult.pages[0].lines[0].content).toBe("A line");
    expect(result.ocrResult.paragraphs[0].content).toBe("hello world");
    expect(result.ocrResult.tables[0].cells[0].content).toBe("$1234");
  });

  it("returns changes with correct structure", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "  hello  ", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({ ocrResult });

    expect(result.changes[0]).toEqual({
      fieldKey: "Name",
      originalValue: "  hello  ",
      correctedValue: "hello",
      reason: "Normalized whitespace",
      source: "rule",
    });
  });

  it("canonicalizes sin and phone to digits-only", async () => {
    const ocrResult = makeOcrResult([
      { key: "sin", value: "936-688-868", confidence: 0.9 },
      { key: "spouse_phone", value: "970.838.608", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("936688868");
    expect(result.ocrResult.keyValuePairs[1].value?.content).toBe("970838608");
    expect(
      result.changes.some(
        (c) => c.reason === "Canonicalized identifier digits",
      ),
    ).toBe(true);
  });

  it("updates valueString on custom model fields so extractAzureFieldDisplayValue sees canonical phone", async () => {
    const ocrResult = makeOcrResult([]);
    ocrResult.documents = [
      {
        docType: "custom",
        fields: {
          spouse_phone: {
            content: "(981) 621 268",
            valueString: "(981) 621 268",
          },
        },
      },
    ];

    const result = await normalizeOcrFields({ ocrResult });
    const field = result.ocrResult.documents![0].fields.spouse_phone;

    expect(field.content).toBe("981621268");
    expect(field.valueString).toBe("981621268");
  });

  it("normalizes identifier field when only valueString is set (no content)", async () => {
    const ocrResult = makeOcrResult([]);
    ocrResult.documents = [
      {
        docType: "custom",
        fields: {
          applicant_sin: {
            valueString: "936-688-868",
          },
        },
      },
    ];

    const result = await normalizeOcrFields({ ocrResult });
    const field = result.ocrResult.documents![0].fields.applicant_sin;

    expect(field.valueString).toBe("936688868");
    expect(field.content).toBeUndefined();
  });

  it("syncs valueNumber when present on identifier field after digit canonicalization", async () => {
    const ocrResult = makeOcrResult([]);
    ocrResult.documents = [
      {
        docType: "custom",
        fields: {
          spouse_phone: {
            content: "(981) 621 268",
            valueString: "(981) 621 268",
            valueNumber: 981621268,
          },
        },
      },
    ];

    const result = await normalizeOcrFields({ ocrResult });
    const field = result.ocrResult.documents![0].fields.spouse_phone as {
      content?: string;
      valueString?: string;
      valueNumber?: number;
    };

    expect(field.content).toBe("981621268");
    expect(field.valueString).toBe("981621268");
    expect(field.valueNumber).toBe(981621268);
  });

  it("sets empty document field content to blank when emptyValueCoercion is blank", async () => {
    const ocrResult = makeOcrResult([]);
    ocrResult.documents = [
      {
        docType: "custom",
        fields: {
          empty_field: {},
          filled: { content: "x" },
        },
      },
    ];

    const result = await normalizeOcrFields({
      ocrResult,
      emptyValueCoercion: "blank",
    });
    const fields = result.ocrResult.documents![0].fields;
    expect(fields.empty_field.content).toBe("");
    expect(fields.filled.content).toBe("x");
    expect(
      buildFlatPredictionMapFromCtx({ cleanedResult: result.ocrResult })
        .empty_field,
    ).toBe("");
  });

  it("coerces empty document fields even when fieldScope excludes them (coercion ignores fieldScope)", async () => {
    const ocrResult = makeOcrResult([]);
    ocrResult.documents = [
      {
        docType: "custom",
        fields: {
          empty_field: {},
        },
      },
    ];

    const result = await normalizeOcrFields({
      ocrResult,
      emptyValueCoercion: "blank",
      fieldScope: ["other"],
    });
    expect(result.ocrResult.documents![0].fields.empty_field.content).toBe("");
  });

  it("sets empty document field content to null when emptyValueCoercion is null", async () => {
    const ocrResult = makeOcrResult([]);
    ocrResult.documents = [
      {
        docType: "custom",
        fields: { empty_field: {} },
      },
    ];

    const result = await normalizeOcrFields({
      ocrResult,
      emptyValueCoercion: "null",
    });
    expect(
      result.ocrResult.documents![0].fields.empty_field.content,
    ).toBeNull();
  });

  it("coerces empty key-value content when emptyValueCoercion is blank", async () => {
    const ocrResult = makeOcrResult([
      { key: "Note", value: "   ", confidence: 0.9 },
    ]);
    const result = await normalizeOcrFields({
      ocrResult,
      emptyValueCoercion: "blank",
    });
    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("");
  });

  it("canonicalizes date fields to YYYY-Mmm-DD", async () => {
    const ocrResult = makeOcrResult([
      { key: "date", value: "30/03/2016", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe(
      "2016-Mar-30",
    );
    expect(
      result.changes.some((c) => c.reason === "Canonicalized date field"),
    ).toBe(true);
  });

  it("clears date-field OCR noise on blank lines (e.g. spouse_date)", async () => {
    const ocrResult = makeOcrResult([
      { key: "spouse_date", value: "$", confidence: 0.9 },
    ]);

    const result = await normalizeOcrFields({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("");
    expect(
      result.changes.some((c) => c.reason === "Cleared date-field OCR noise"),
    ).toBe(true);
  });

  describe("field format engine integration", () => {
    let prismaMock: { templateModel: { findUnique: jest.Mock } };

    beforeEach(() => {
      prismaMock = {
        templateModel: { findUnique: jest.fn() },
      };
      getPrismaClientMock.mockReturnValue(prismaMock);
    });

    afterEach(() => {
      getPrismaClientMock.mockReset();
    });

    it("normalizes SIN field using format spec digits canonicalization", async () => {
      prismaMock.templateModel.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "sin_number",
            field_type: "string",
            field_format: null,
            format_spec: JSON.stringify({
              canonicalize: "digits",
              pattern: "^\\d{9}$",
            }),
          },
        ],
      });
      const ocrResult = makeOcrResult([]);
      ocrResult.documents = [
        {
          docType: "custom",
          fields: {
            sin_number: { content: "872 318 748", valueString: "872 318 748" },
          },
        },
      ];

      const result = await normalizeOcrFields({
        ocrResult,
        documentType: "proj-1",
      });

      expect(result.ocrResult.documents![0].fields.sin_number.content).toBe(
        "872318748",
      );
      expect(
        result.changes.some((c) =>
          c.reason.includes("Format spec canonicalization"),
        ),
      ).toBe(true);
    });

    it("normalizes phone field using format spec with displayTemplate", async () => {
      prismaMock.templateModel.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "phone_number",
            field_type: "string",
            field_format: null,
            format_spec: JSON.stringify({
              canonicalize: "digits",
              displayTemplate: "(###) ###-###",
            }),
          },
        ],
      });
      const ocrResult = makeOcrResult([]);
      ocrResult.documents = [
        {
          docType: "custom",
          fields: {
            phone_number: {
              content: "442-836-849",
              valueString: "442-836-849",
            },
          },
        },
      ];

      const result = await normalizeOcrFields({
        ocrResult,
        documentType: "proj-1",
      });

      expect(result.ocrResult.documents![0].fields.phone_number.content).toBe(
        "(442) 836-849",
      );
      expect(
        result.changes.some((c) =>
          c.reason.includes("Format spec canonicalization"),
        ),
      ).toBe(true);
    });

    it("normalizes date field using format spec date canonicalization", async () => {
      prismaMock.templateModel.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "birth_date",
            field_type: "date",
            field_format: null,
            format_spec: JSON.stringify({ canonicalize: "date:YYYY-MM-DD" }),
          },
        ],
      });
      const ocrResult = makeOcrResult([]);
      ocrResult.documents = [
        {
          docType: "custom",
          fields: {
            birth_date: {
              content: "2009-Apr-22",
              valueString: "2009-Apr-22",
            },
          },
        },
      ];

      const result = await normalizeOcrFields({
        ocrResult,
        documentType: "proj-1",
      });

      expect(result.ocrResult.documents![0].fields.birth_date.content).toBe(
        "2009-04-22",
      );
      expect(
        result.changes.some((c) =>
          c.reason.includes("Format spec canonicalization"),
        ),
      ).toBe(true);
    });

    it("normalizes text field using format spec text canonicalization", async () => {
      prismaMock.templateModel.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "description",
            field_type: "string",
            field_format: null,
            format_spec: JSON.stringify({ canonicalize: "text" }),
          },
        ],
      });
      const ocrResult = makeOcrResult([]);
      ocrResult.documents = [
        {
          docType: "custom",
          fields: {
            description: {
              content: "avoid various .",
              valueString: "avoid various .",
            },
          },
        },
      ];

      const result = await normalizeOcrFields({
        ocrResult,
        documentType: "proj-1",
      });

      expect(result.ocrResult.documents![0].fields.description.content).toBe(
        "avoid various.",
      );
      expect(
        result.changes.some((c) =>
          c.reason.includes("Format spec canonicalization"),
        ),
      ).toBe(true);
    });

    it("falls back to heuristic normalization for fields without format spec", async () => {
      prismaMock.templateModel.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "applicant_sin",
            field_type: "string",
            field_format: null,
            format_spec: null,
          },
        ],
      });
      const ocrResult = makeOcrResult([]);
      ocrResult.documents = [
        {
          docType: "custom",
          fields: {
            applicant_sin: {
              content: "936-688-868",
              valueString: "936-688-868",
            },
          },
        },
      ];

      const result = await normalizeOcrFields({
        ocrResult,
        documentType: "proj-1",
      });

      // Should use heuristic identifier canonicalization (digits-only)
      expect(result.ocrResult.documents![0].fields.applicant_sin.content).toBe(
        "936688868",
      );
      expect(
        result.changes.some(
          (c) => c.reason === "Canonicalized identifier digits",
        ),
      ).toBe(true);
    });
  });

  describe("schema-aware (documentType)", () => {
    let prismaMock: { templateModel: { findUnique: jest.Mock } };

    beforeEach(() => {
      prismaMock = {
        templateModel: { findUnique: jest.fn() },
      };
      getPrismaClientMock.mockReturnValue(prismaMock);
    });

    afterEach(() => {
      getPrismaClientMock.mockReset();
    });

    it("does not run number rules on string-typed schema fields", async () => {
      prismaMock.templateModel.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "name",
            field_type: "string",
            field_format: null,
            format_spec: null,
          },
        ],
      });
      const ocrResult = makeOcrResult([]);
      ocrResult.documents = [
        {
          docType: "custom",
          fields: {
            name: { content: "1,234.00" },
          },
        },
      ];

      const result = await normalizeOcrFields({
        ocrResult,
        documentType: "proj-1",
      });

      expect(result.ocrResult.documents![0].fields.name.content).toBe(
        "1,234.00",
      );
      expect(result.metadata?.schemaAware).toBe(true);
      expect(result.metadata?.schemaFieldCount).toBe(1);
    });

    it("runs number rules on number-typed schema fields", async () => {
      prismaMock.templateModel.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "amount",
            field_type: "number",
            field_format: null,
            format_spec: null,
          },
        ],
      });
      const ocrResult = makeOcrResult([]);
      ocrResult.documents = [
        {
          docType: "custom",
          fields: {
            amount: { content: "$ 1,234.56" },
          },
        },
      ];

      const result = await normalizeOcrFields({
        ocrResult,
        documentType: "proj-1",
      });

      const out = result.ocrResult.documents![0].fields.amount.content;
      expect(out).not.toContain(",");
      expect(out).toMatch(/1234\.56/);
    });

    it("canonicalizes date-typed fields by schema even when key is not *_date", async () => {
      prismaMock.templateModel.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "birth",
            field_type: "date",
            field_format: null,
            format_spec: null,
          },
        ],
      });
      const ocrResult = makeOcrResult([]);
      ocrResult.documents = [
        {
          docType: "custom",
          fields: {
            birth: { content: "30/03/2016" },
          },
        },
      ];

      const result = await normalizeOcrFields({
        ocrResult,
        documentType: "proj-1",
      });

      expect(result.ocrResult.documents![0].fields.birth.content).toBe(
        "2016-Mar-30",
      );
    });
  });
});
