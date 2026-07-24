import { fieldDefinitionsToMistralDocumentAnnotationFormat } from "./field-definitions-to-mistral-annotation-format";

describe("fieldDefinitionsToMistralDocumentAnnotationFormat", () => {
  it("returns null for empty fields", () => {
    expect(fieldDefinitionsToMistralDocumentAnnotationFormat([])).toBeNull();
  });

  it("builds json_schema with properties and required", () => {
    const fmt = fieldDefinitionsToMistralDocumentAnnotationFormat([
      { field_key: "invoice_id", field_type: "string" },
      { field_key: "total", field_type: "number" },
      { field_key: "approved", field_type: "selectionMark" },
    ]);
    expect(fmt).not.toBeNull();
    expect(fmt!.type).toBe("json_schema");
    expect(fmt!.json_schema.schema.properties.invoice_id).toEqual({
      type: "string",
      title: "invoice_id",
    });
    expect(fmt!.json_schema.schema.properties.total).toEqual({
      type: "number",
      title: "total",
    });
    expect(fmt!.json_schema.schema.properties.approved).toEqual({
      type: "string",
      title: "approved",
      enum: ["selected", "unselected"],
    });
    expect(fmt!.json_schema.schema.required).toEqual([
      "invoice_id",
      "total",
      "approved",
    ]);
    expect(fmt!.json_schema.schema.additionalProperties).toBe(false);
    // Required for the Foundry deployment to actually run the annotation
    // step (otherwise document_annotation is silently null).
    expect(fmt!.json_schema.strict).toBe(true);
  });

  it("attaches per-field descriptions when provided in options", () => {
    const fmt = fieldDefinitionsToMistralDocumentAnnotationFormat(
      [
        { field_key: "invoice_id", field_type: "string" },
        { field_key: "total", field_type: "number" },
      ],
      {
        descriptions: {
          invoice_id: "The invoice number printed at the top.",
          // missing entry for total → no description emitted
        },
      },
    );
    expect(fmt!.json_schema.schema.properties.invoice_id).toEqual({
      type: "string",
      title: "invoice_id",
      description: "The invoice number printed at the top.",
    });
    expect(fmt!.json_schema.schema.properties.total).toEqual({
      type: "number",
      title: "total",
    });
  });

  it("makes numeric fields nullable when numericFieldsNullable is set", () => {
    const fmt = fieldDefinitionsToMistralDocumentAnnotationFormat(
      [
        { field_key: "amount", field_type: "number" },
        { field_key: "label", field_type: "string" },
      ],
      { numericFieldsNullable: true },
    );
    expect(fmt!.json_schema.schema.properties.amount.type).toEqual([
      "number",
      "null",
    ]);
    // Strings are unaffected by the flag.
    expect(fmt!.json_schema.schema.properties.label.type).toBe("string");
  });

  it("trims descriptions and skips empty/whitespace entries", () => {
    const fmt = fieldDefinitionsToMistralDocumentAnnotationFormat(
      [{ field_key: "id", field_type: "string" }],
      { descriptions: { id: "   " } },
    );
    expect(fmt!.json_schema.schema.properties.id).toEqual({
      type: "string",
      title: "id",
    });
  });

  it("skips blank field_key", () => {
    const fmt = fieldDefinitionsToMistralDocumentAnnotationFormat([
      { field_key: "  ", field_type: "string" },
      { field_key: "ok", field_type: "string" },
    ]);
    expect(fmt!.json_schema.schema.required).toEqual(["ok"]);
  });
});
