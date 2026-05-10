import { describe, expect, it } from "@jest/globals";
import {
  buildCuAnalyzerDefinition,
  type CuTemplateFieldDefinitionInput,
  hashCuAnalyzerDefinition,
} from "./analyzer-schema-builder";

const baseFields: CuTemplateFieldDefinitionInput[] = [
  { field_key: "applicant_name", field_type: "string" },
  { field_key: "applicant_employment_income", field_type: "number" },
  { field_key: "applicant_signed_date", field_type: "date" },
  { field_key: "checkbox_yes", field_type: "selectionMark" },
  { field_key: "applicant_signature", field_type: "signature" },
];

describe("buildCuAnalyzerDefinition", () => {
  it("returns null when no fields are provided", () => {
    expect(buildCuAnalyzerDefinition([])).toBeNull();
  });

  it("returns null when all field_keys are blank", () => {
    expect(
      buildCuAnalyzerDefinition([
        { field_key: "  ", field_type: "string" },
        { field_key: "", field_type: "number" },
      ]),
    ).toBeNull();
  });

  it("builds the canonical analyzer body with sensible defaults", () => {
    const def = buildCuAnalyzerDefinition(baseFields);
    expect(def).not.toBeNull();
    expect(def?.baseAnalyzerId).toBe("prebuilt-document");
    expect(def?.models.completion).toBe("prebuilt-analyzer-completion");
    expect(def?.models.embedding).toBe("prebuilt-analyzer-embedding");
    expect(def?.config.returnDetails).toBe(true);
    expect(def?.config.estimateFieldSourceAndConfidence).toBe(true);
    const fields = def?.fieldSchema.fields ?? {};
    expect(Object.keys(fields)).toEqual([
      "applicant_name",
      "applicant_employment_income",
      "applicant_signed_date",
      "checkbox_yes",
      "applicant_signature",
    ]);
    expect(fields.applicant_name).toEqual({
      type: "string",
      method: "extract",
    });
    expect(fields.applicant_employment_income).toEqual({
      type: "number",
      method: "extract",
    });
    expect(fields.applicant_signed_date).toEqual({
      type: "date",
      method: "extract",
    });
    expect(fields.checkbox_yes).toEqual({
      type: "string",
      method: "classify",
      enum: ["selected", "unselected"],
    });
    expect(fields.applicant_signature).toEqual({
      type: "string",
      method: "extract",
    });
    expect(def?.description).toBeUndefined();
  });

  it("attaches the global prompt to the analyzer's top-level description", () => {
    const def = buildCuAnalyzerDefinition(baseFields, {
      documentAnnotationPrompt: "Extract structured field values per the form.",
    });
    expect(def?.description).toBe(
      "Extract structured field values per the form.",
    );
  });

  it("attaches per-field descriptions only for keys with non-empty values", () => {
    const def = buildCuAnalyzerDefinition(baseFields, {
      descriptions: {
        applicant_name: "Printed full name.",
        applicant_employment_income: "  ",
        unknown_field: "ignored",
      },
    });
    expect(def?.fieldSchema.fields.applicant_name.description).toBe(
      "Printed full name.",
    );
    expect(
      def?.fieldSchema.fields.applicant_employment_income.description,
    ).toBeUndefined();
  });

  it("appends a nullable hint to numeric field descriptions when numericFieldsNullable is on", () => {
    const def = buildCuAnalyzerDefinition(baseFields, {
      numericFieldsNullable: true,
      descriptions: {
        applicant_employment_income: "Net employment income.",
      },
    });
    const numField = def?.fieldSchema.fields.applicant_employment_income;
    expect(numField?.type).toBe("number");
    expect(numField?.description).toContain("Net employment income.");
    expect(numField?.description).toContain("return null");
  });

  it("synthesises a description when numericFieldsNullable is on but no overlay was provided", () => {
    const def = buildCuAnalyzerDefinition(baseFields, {
      numericFieldsNullable: true,
    });
    const numField = def?.fieldSchema.fields.applicant_employment_income;
    expect(numField?.description).toMatch(/return null/);
  });

  it("respects an alternate baseAnalyzerId override", () => {
    const def = buildCuAnalyzerDefinition(baseFields, {
      baseAnalyzerId: "prebuilt-image",
    });
    expect(def?.baseAnalyzerId).toBe("prebuilt-image");
  });

  it("respects completion / embedding model alias overrides (locks to a specific model)", () => {
    const def = buildCuAnalyzerDefinition(baseFields, {
      completionModelAlias: "gpt-5.2",
      embeddingModelAlias: "text-embedding-3-large",
    });
    expect(def?.models.completion).toBe("gpt-5.2");
    expect(def?.models.embedding).toBe("text-embedding-3-large");
  });
});

describe("hashCuAnalyzerDefinition", () => {
  it("returns the same hash for identical bodies", () => {
    const a = buildCuAnalyzerDefinition(baseFields)!;
    const b = buildCuAnalyzerDefinition(baseFields)!;
    expect(hashCuAnalyzerDefinition(a)).toBe(hashCuAnalyzerDefinition(b));
  });

  it("returns a different hash when the prompt changes", () => {
    const a = buildCuAnalyzerDefinition(baseFields)!;
    const b = buildCuAnalyzerDefinition(baseFields, {
      documentAnnotationPrompt: "x",
    })!;
    expect(hashCuAnalyzerDefinition(a)).not.toBe(hashCuAnalyzerDefinition(b));
  });
});
