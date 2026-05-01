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
  });

  it("skips blank field_key", () => {
    const fmt = fieldDefinitionsToMistralDocumentAnnotationFormat([
      { field_key: "  ", field_type: "string" },
      { field_key: "ok", field_type: "string" },
    ]);
    expect(fmt!.json_schema.schema.required).toEqual(["ok"]);
  });
});
