/**
 * Unit tests for the VLM-direct prompt + JSON Schema builder.
 *
 * Covers vocabulary mapping (FieldType → JSON Schema property), the
 * nullable-numeric description hint, the source_quotes sibling object,
 * OpenAI strict-mode shape (additionalProperties:false, full required[]),
 * description overlay, and deterministic hashing.
 */

import { describe, expect, it } from "@jest/globals";
import {
  buildVlmExtractionRequest,
  hashVlmExtractionRequest,
  type VlmTemplateFieldDefinition,
} from "./vlm-prompt-builder";

const FIELDS: VlmTemplateFieldDefinition[] = [
  { field_key: "name", field_type: "string" },
  { field_key: "amount", field_type: "number" },
  { field_key: "date", field_type: "date" },
  { field_key: "checkbox_yes", field_type: "selectionMark" },
  { field_key: "signature", field_type: "signature" },
];

describe("buildVlmExtractionRequest", () => {
  it("returns null on an empty field list", () => {
    expect(buildVlmExtractionRequest({ fields: [] })).toBeNull();
  });

  it("returns null when every field key is whitespace", () => {
    expect(
      buildVlmExtractionRequest({
        fields: [
          { field_key: "  ", field_type: "string" },
          { field_key: "", field_type: "number" },
        ],
      }),
    ).toBeNull();
  });

  it("emits a system message that combines the default + global prompt", () => {
    const r = buildVlmExtractionRequest({
      fields: FIELDS,
      documentAnnotationPrompt: "Read the form carefully.",
    });
    expect(r).not.toBeNull();
    expect(r!.systemPrompt).toContain("Read the form carefully.");
    // Default safety preamble should still be present.
    expect(r!.systemPrompt).toMatch(/document-extraction|conservative/i);
  });

  it("user prompt asks for source quotes (hallucination guard)", () => {
    const r = buildVlmExtractionRequest({ fields: FIELDS });
    expect(r!.userPrompt.toLowerCase()).toMatch(/source_quote|verbatim|quote/);
  });

  it("response_format is strict-mode json_schema with both fields and source_quotes objects", () => {
    const r = buildVlmExtractionRequest({ fields: FIELDS });
    expect(r!.responseFormat.strict).toBe(true);
    const schema = r!.responseFormat.schema;
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["fields", "source_quotes"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.fields.type).toBe("object");
    expect(schema.properties.source_quotes.type).toBe("object");
    expect(schema.properties.fields.additionalProperties).toBe(false);
    expect(schema.properties.source_quotes.additionalProperties).toBe(false);
  });

  it("strict mode: every field key is in required and has a property", () => {
    const r = buildVlmExtractionRequest({ fields: FIELDS });
    const fieldKeys = FIELDS.map((f) => f.field_key);
    expect(r!.responseFormat.schema.properties.fields.required.sort()).toEqual(
      fieldKeys.sort(),
    );
    expect(
      r!.responseFormat.schema.properties.source_quotes.required.sort(),
    ).toEqual(fieldKeys.sort());
    for (const k of fieldKeys) {
      expect(
        r!.responseFormat.schema.properties.fields.properties[k],
      ).toBeDefined();
      expect(
        r!.responseFormat.schema.properties.source_quotes.properties[k],
      ).toBeDefined();
    }
  });

  it("vocabulary mapping: number → [number, null], date → string, selectionMark → enum, signature → string", () => {
    // Pass numericFieldsNullable: false so the bare numeric type is emitted
    // without the appended blank-vs-zero hint (covered by its own test below).
    const r = buildVlmExtractionRequest({
      fields: FIELDS,
      numericFieldsNullable: false,
    });
    const props = r!.responseFormat.schema.properties.fields.properties;
    expect(props.name).toEqual({ type: "string" });
    expect(props.amount).toEqual({ type: ["number", "null"] });
    expect(props.date).toEqual({ type: "string" });
    expect(props.checkbox_yes).toEqual({
      type: "string",
      enum: ["selected", "unselected"],
    });
    expect(props.signature).toEqual({ type: "string" });
  });

  it("descriptions overlay: attaches description to value property", () => {
    const r = buildVlmExtractionRequest({
      fields: FIELDS,
      descriptions: {
        name: "Applicant printed name",
        amount: "Applicant Section 2 income",
      },
    });
    const props = r!.responseFormat.schema.properties.fields.properties;
    expect((props.name as { description?: string }).description).toBe(
      "Applicant printed name",
    );
    expect((props.amount as { description?: string }).description).toContain(
      "Applicant Section 2 income",
    );
  });

  it("numericFieldsNullable=true appends the blank-vs-zero hint to numeric descriptions", () => {
    const r = buildVlmExtractionRequest({
      fields: FIELDS,
      descriptions: { amount: "Section 2 income." },
      numericFieldsNullable: true,
    });
    const amount = r!.responseFormat.schema.properties.fields.properties
      .amount as { description?: string };
    expect(amount.description).toContain("Section 2 income.");
    expect(amount.description).toContain("blank");
    expect(amount.description).toContain("null");
  });

  it("numericFieldsNullable=false omits the blank-vs-zero hint", () => {
    const r = buildVlmExtractionRequest({
      fields: FIELDS,
      descriptions: { amount: "Section 2 income." },
      numericFieldsNullable: false,
    });
    const amount = r!.responseFormat.schema.properties.fields.properties
      .amount as { description?: string };
    expect(amount.description).toBe("Section 2 income.");
  });

  it("source_quotes properties are all strings (per strict mode)", () => {
    const r = buildVlmExtractionRequest({ fields: FIELDS });
    const quoteProps =
      r!.responseFormat.schema.properties.source_quotes.properties;
    for (const key of Object.keys(quoteProps)) {
      expect(quoteProps[key].type).toBe("string");
    }
  });

  it("schema name follows OpenAI's pattern and defaults to sdpr_vlm_extraction", () => {
    const r = buildVlmExtractionRequest({ fields: FIELDS });
    expect(r!.responseFormat.name).toBe("sdpr_vlm_extraction");
    expect(r!.responseFormat.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });

  it("schemaName override is honoured", () => {
    const r = buildVlmExtractionRequest({
      fields: FIELDS,
      schemaName: "custom-name_42",
    });
    expect(r!.responseFormat.name).toBe("custom-name_42");
  });

  it("duplicate field_key entries collapse to a single property (deterministic)", () => {
    const r = buildVlmExtractionRequest({
      fields: [
        { field_key: "name", field_type: "string" },
        { field_key: "name", field_type: "string" },
      ],
    });
    const fieldKeys = r!.fieldKeys;
    expect(fieldKeys).toEqual(["name"]);
    expect(r!.responseFormat.schema.properties.fields.required).toEqual([
      "name",
    ]);
  });
});

describe("hashVlmExtractionRequest", () => {
  it("returns the same hash for the same request body", () => {
    const a = buildVlmExtractionRequest({ fields: FIELDS });
    const b = buildVlmExtractionRequest({ fields: FIELDS });
    expect(hashVlmExtractionRequest(a!)).toBe(hashVlmExtractionRequest(b!));
  });

  it("differs when the prompt changes", () => {
    const a = buildVlmExtractionRequest({
      fields: FIELDS,
      documentAnnotationPrompt: "Prompt A",
    });
    const b = buildVlmExtractionRequest({
      fields: FIELDS,
      documentAnnotationPrompt: "Prompt B",
    });
    expect(hashVlmExtractionRequest(a!)).not.toBe(hashVlmExtractionRequest(b!));
  });
});
