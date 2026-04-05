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

  describe("profile-driven confusion rules", () => {
    const prismaMock = {
      confusionProfile: {
        findUnique: jest.fn(),
      },
      templateModel: {
        findUnique: jest.fn(),
      },
    };

    beforeEach(() => {
      getPrismaClientMock.mockReturnValue(prismaMock);
    });

    afterEach(() => {
      getPrismaClientMock.mockReset();
    });

    it("loads profile and applies all matrix entries as substitution rules", async () => {
      // Profile matrix: O was read as 0 (42 times), : was read as 1 (5 times), l was read as 1 (18 times)
      // Corrections: 0 → O, 1 → : (but 1 → l would conflict — last one wins in iteration order)
      // Per spec: trueChar → recognizedChar means OCR reads trueChar as recognizedChar
      // So map[recognizedChar] = trueChar: map["0"] = "O", map["1"] = ":" (overwritten by map["1"] = "l")
      // Input "7:2O.OO" with applyToAllFields: true
      // O → recognizedChar for trueChar O... wait, let's re-read spec:
      // matrix[trueChar][recognizedChar]: OCR reads trueChar as recognizedChar → map[recognizedChar] = trueChar
      // matrix["O"]["0"] = 42: OCR reads "O" as "0" → map["0"] = "O" ... but we want correction: seeing "0" means it should be "O"
      // However the spec example says Expected: "7120.00" for "7:2O.OO"
      // That means O→0 and :→1 apply. So map["O"]="0" and map[":"]="1"?
      // Re-reading: matrix[trueChar][recognizedChar] and map[recognizedChar] = trueChar
      // But test expects "7:2O.OO" → "7120.00" meaning ":" becomes "1" and "O" becomes "0"
      // So map[":"] = "1" and map["O"] = "0"
      // For matrix["O"]["0"]=42: recognizedChar="0", trueChar="O" → map["0"]="O" (not what we want)
      // The expected output "7120.00" shows O→0 and :→1, so:
      // matrix entry "0"→{"O": 42} would give map["O"]="0" ✓
      // matrix entry "1"→{":": 5, "l": 18} would give map[":"]=1 and map["l"]="1" ✓
      // Let's structure matrix that way for the test

      prismaMock.confusionProfile.findUnique.mockResolvedValue({
        id: "profile-1",
        name: "Test profile",
        matrix: {
          "0": { O: 42 },
          "1": { ":": 5, l: 18 },
        },
      });

      const ocrResult = makeOcrResult([
        { key: "code", value: "7:2O.OO", confidence: 0.9 },
      ]);

      const result = await characterConfusionCorrection({
        ocrResult,
        confusionProfileId: "profile-1",
        applyToAllFields: true,
      });

      expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("7120.00");
      expect(result.changes).toHaveLength(1);
      expect(result.metadata?.useProfile).toBe(true);
      expect(result.metadata?.confusionProfileId).toBe("profile-1");
    });

    it("falls back to built-in rules when no profile specified", async () => {
      const ocrResult = makeOcrResult([
        { key: "Amount", value: "O89714425", confidence: 0.9 },
      ]);

      const result = await characterConfusionCorrection({
        ocrResult,
        applyToAllFields: true,
      });

      expect(result.ocrResult.keyValuePairs[0].value?.content).toBe(
        "089714425",
      );
      expect(result.metadata?.useProfile).toBe(false);
    });
  });

  describe("schema-aware (documentType)", () => {
    const prismaMock = {
      confusionProfile: {
        findUnique: jest.fn(),
      },
      templateModel: {
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
      prismaMock.templateModel.findUnique.mockResolvedValue({
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
      prismaMock.templateModel.findUnique.mockResolvedValue({
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
      prismaMock.templateModel.findUnique.mockResolvedValue({
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
