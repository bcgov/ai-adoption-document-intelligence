import {
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
