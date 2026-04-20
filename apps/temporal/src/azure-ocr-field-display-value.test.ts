import {
  buildFlatConfidenceMapFromCtx,
  buildFlatPredictionMapFromCtx,
  extractAzureFieldDisplayValue,
} from "./azure-ocr-field-display-value";

describe("extractAzureFieldDisplayValue", () => {
  it("returns null for an empty field object", () => {
    expect(extractAzureFieldDisplayValue({})).toBeNull();
  });
});

describe("buildFlatPredictionMapFromCtx", () => {
  it("maps empty document fields to null (use ocr.normalizeFields emptyValueCoercion for blank GT)", () => {
    const flat = buildFlatPredictionMapFromCtx({
      cleanedResult: {
        documents: [{ fields: { empty_field: {} } }],
      },
    });
    expect(flat.empty_field).toBeNull();
  });

  it("uses null for missing keyValuePair value content", () => {
    const flat = buildFlatPredictionMapFromCtx({
      cleanedResult: {
        keyValuePairs: [
          {
            key: { content: "Note" },
            value: { content: undefined as unknown as string },
          },
        ],
      },
    });
    expect(flat.Note).toBeNull();
  });

  it("maps nullish custom-model slots to null", () => {
    const flat = buildFlatPredictionMapFromCtx({
      ocrResult: {
        documents: [
          {
            fields: {
              spouse_sin: {
                content: undefined,
                valueString: undefined,
              } as Record<string, unknown>,
            },
          },
        ],
      },
    });
    expect(flat.spouse_sin).toBeNull();
  });
});

describe("buildFlatConfidenceMapFromCtx", () => {
  it("extracts confidence from custom-model documents[0].fields", () => {
    const conf = buildFlatConfidenceMapFromCtx({
      cleanedResult: {
        documents: [
          {
            fields: {
              invoiceNumber: { valueString: "INV-1", confidence: 0.92 },
              total: { valueNumber: 100, confidence: 0.41 },
              notes: { valueString: "n/a" },
            },
          },
        ],
      },
    });
    expect(conf).toEqual({
      invoiceNumber: 0.92,
      total: 0.41,
      notes: null,
    });
  });

  it("extracts confidence from prebuilt-model keyValuePairs", () => {
    const conf = buildFlatConfidenceMapFromCtx({
      ocrResult: {
        keyValuePairs: [
          {
            key: { content: "Name" },
            value: { content: "Acme" },
            confidence: 0.88,
          },
          { key: { content: "Date" }, value: { content: "2024-01-01" } },
        ],
      },
    });
    expect(conf).toEqual({ Name: 0.88, Date: null });
  });

  it("returns empty object when no ocr result present", () => {
    expect(buildFlatConfidenceMapFromCtx({})).toEqual({});
  });
});
