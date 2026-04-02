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

import { getPrismaClient } from "./database-client";
import { characterConfusionCorrection } from "./ocr-character-confusion";

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
    pages: [],
    tables: [],
    paragraphs: [],
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

describe("characterConfusionCorrection", () => {
  it("does not substitute map letters in plain names (no digits)", async () => {
    const ocrResult = makeOcrResult([
      { key: "name", value: "Amy Scott MD", confidence: 0.9 },
      {
        key: "explain_changes",
        value: "More method discussi",
        confidence: 0.9,
      },
    ]);

    const result = await characterConfusionCorrection({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe(
      "Amy Scott MD",
    );
    expect(result.ocrResult.keyValuePairs[1].value?.content).toBe(
      "More method discussi",
    );
    expect(result.changes).toHaveLength(0);
  });

  it("corrects O→0 in date/number-like values", async () => {
    const ocrResult = makeOcrResult([
      { key: "Date", value: "2O24-01-15", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("2024-01-15");
    expect(result.changes.length).toBe(1);
    expect(result.changes[0].reason).toContain("Character confusion");
  });

  it("corrects l→1 in numeric context", async () => {
    const ocrResult = makeOcrResult([
      { key: "Amount", value: "l,234.56", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("1,234.56");
  });

  it("does not mutate original", async () => {
    const ocrResult = makeOcrResult([
      { key: "Date", value: "2O24-Ol-l5", confidence: 0.9 },
    ]);
    const originalValue = ocrResult.keyValuePairs[0].value?.content;

    await characterConfusionCorrection({ ocrResult });

    expect(ocrResult.keyValuePairs[0].value?.content).toBe(originalValue);
  });

  it("supports custom confusion map override", async () => {
    const ocrResult = makeOcrResult([
      { key: "Code", value: "ABC-XYZ", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      confusionMapOverride: { X: "K" },
      applyToAllFields: true,
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("ABC-KYZ");
  });

  it("respects fieldScope", async () => {
    const ocrResult = makeOcrResult([
      { key: "Date", value: "2O24-01-15", confidence: 0.9 },
      { key: "Name", value: "2O24-01-15", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      fieldScope: ["Date"],
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("2024-01-15");
    expect(result.ocrResult.keyValuePairs[1].value?.content).toBe("2O24-01-15");
  });

  it("protects month abbreviations", async () => {
    const ocrResult = makeOcrResult([
      { key: "Date", value: "Sep-2O24", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      applyToAllFields: true,
    });

    const corrected = result.ocrResult.keyValuePairs[0].value?.content;
    expect(corrected).toContain("Sep");
    expect(corrected).toContain("2024");
  });

  it("returns empty changes for already correct values", async () => {
    const ocrResult = makeOcrResult([
      { key: "Amount", value: "12345", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({ ocrResult });
    expect(result.changes).toHaveLength(0);
  });

  it("keeps slash separators for valid slash dates", async () => {
    const ocrResult = makeOcrResult([
      { key: "Date", value: "30/03/2016", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      confusionMapOverride: { "/": "1" },
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("30/03/2016");
  });

  it("with default map, corrects slash-as-one in money-like value (6/91.12 → 6191.12)", async () => {
    const ocrResult = makeOcrResult([
      {
        key: "applicant_spousal_support_alimony",
        value: "6/91.12",
        confidence: 0.9,
      },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      fieldScope: ["applicant_spousal_support_alimony"],
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("6191.12");
    expect(result.changes).toHaveLength(1);
  });

  it("with default map, preserves slash-separated date", async () => {
    const ocrResult = makeOcrResult([
      { key: "spouse_date", value: "30/03/2016", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      fieldScope: ["spouse_date"],
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("30/03/2016");
  });

  it("applies slash substitution for non-date values", async () => {
    const ocrResult = makeOcrResult([
      { key: "AccountCode", value: "12/34", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      confusionMapOverride: { "/": "1" },
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("12134");
  });

  it("does not clear standalone mask symbol", async () => {
    const ocrResult = makeOcrResult([
      { key: "spouse_date", value: "$", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      confusionMapOverride: { $: "" },
      applyToAllFields: true,
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("$");
  });

  it("confusionMapOverride replaces built-in rules; enabledRules are ignored", async () => {
    const ocrResult = makeOcrResult([
      { key: "Code", value: "O-only", confidence: 0.9 },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      confusionMapOverride: { X: "K" },
      enabledRules: ["oToZero"],
      applyToAllFields: true,
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("O-only");
    expect(result.metadata?.useOverride).toBe(true);
  });

  it("disabledRules omits slashToOne so money-like slash value is unchanged", async () => {
    const ocrResult = makeOcrResult([
      {
        key: "applicant_spousal_support_alimony",
        value: "6/91.12",
        confidence: 0.9,
      },
    ]);

    const result = await characterConfusionCorrection({
      ocrResult,
      fieldScope: ["applicant_spousal_support_alimony"],
      disabledRules: ["slashToOne"],
    });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("6/91.12");
    expect(result.changes).toHaveLength(0);
  });

  describe("schema-aware (documentType)", () => {
    const prismaMock = {
      labelingProject: {
        findUnique: jest.fn(),
      },
    };

    beforeEach(() => {
      getPrismaClientMock.mockReturnValue(prismaMock);
    });

    afterEach(() => {
      getPrismaClientMock.mockReset();
    });

    it("loads field_schema and applies substitutions for schema number field without id/date key heuristics", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "total_amount",
            field_type: "number",
            field_format: null,
            display_order: 0,
          },
        ],
      });

      const ocrResult = makeOcrResult([
        { key: "total_amount", value: "2O24-01-15", confidence: 0.9 },
      ]);

      const result = await characterConfusionCorrection({
        ocrResult,
        documentType: "proj-1",
      });

      expect(result.ocrResult.keyValuePairs[0].value?.content).toBe(
        "2024-01-15",
      );
      expect(result.metadata?.schemaAware).toBe(true);
      expect(result.metadata?.documentType).toBe("proj-1");
    });

    it("omits slashToOne for schema string fields", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "notes",
            field_type: "string",
            field_format: null,
            display_order: 0,
          },
        ],
      });

      const ocrResult = makeOcrResult([
        { key: "notes", value: "6/91.12", confidence: 0.9 },
      ]);

      const result = await characterConfusionCorrection({
        ocrResult,
        documentType: "proj-1",
        fieldScope: ["notes"],
      });

      expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("6/91.12");
      expect(result.changes).toHaveLength(0);
    });

    it("applies no confusion rules for schema selectionMark fields", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue({
        id: "proj-1",
        field_schema: [
          {
            field_key: "agree",
            field_type: "selectionMark",
            field_format: null,
            display_order: 0,
          },
        ],
      });

      const ocrResult = makeOcrResult([
        { key: "agree", value: "2O24", confidence: 0.9 },
      ]);

      const result = await characterConfusionCorrection({
        ocrResult,
        documentType: "proj-1",
        fieldScope: ["agree"],
      });

      expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("2O24");
      expect(result.changes).toHaveLength(0);
    });
  });
});
