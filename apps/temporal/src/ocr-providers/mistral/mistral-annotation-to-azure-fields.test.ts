import {
  mistralAnnotationToDocumentsAndKeyValuePairs,
  rawValueToAzureDocumentFieldValue,
} from "./mistral-annotation-to-azure-fields";

describe("rawValueToAzureDocumentFieldValue", () => {
  it("maps number type", () => {
    const f = rawValueToAzureDocumentFieldValue(42.5, "number");
    expect(f.valueNumber).toBe(42.5);
    expect(f.type).toBe("number");
  });

  it("maps selectionMark", () => {
    const f = rawValueToAzureDocumentFieldValue("selected", "selectionMark");
    expect(f.valueSelectionMark).toBe("selected");
    expect(f.type).toBe("selectionMark");
  });

  it("maps checkbox selected variants to selected", () => {
    const selectedVariants = [
      true,
      "checked",
      "yes",
      "true",
      "1",
      "on",
      "☑",
      "☒",
      "✓",
      "✔",
      "x",
    ];

    for (const variant of selectedVariants) {
      const f = rawValueToAzureDocumentFieldValue(variant, "selectionMark");
      expect(f.valueSelectionMark).toBe("selected");
      expect(f.valueString).toBe("selected");
    }
  });

  it("maps checkbox unselected variants to unselected", () => {
    const unselectedVariants = [
      false,
      "unselected",
      "unchecked",
      "no",
      "false",
      "0",
      "off",
      "☐",
      "✗",
      "✘",
      "",
      "unknown-value",
    ];

    for (const variant of unselectedVariants) {
      const f = rawValueToAzureDocumentFieldValue(variant, "selectionMark");
      expect(f.valueSelectionMark).toBe("unselected");
      expect(f.valueString).toBe("unselected");
    }
  });
});

describe("mistralAnnotationToDocumentsAndKeyValuePairs", () => {
  it("uses legacy string KVP path when fieldDefs empty", () => {
    const { documents, keyValuePairs } =
      mistralAnnotationToDocumentsAndKeyValuePairs(
        JSON.stringify({ a: "1" }),
        [],
      );
    expect(documents).toBeUndefined();
    expect(keyValuePairs).toHaveLength(1);
    expect(keyValuePairs[0].key.content).toBe("a");
  });

  it("builds documents and typed keyValuePairs from schema order", () => {
    const ann = JSON.stringify({ total: 100, name: "Acme" });
    const { documents, keyValuePairs } =
      mistralAnnotationToDocumentsAndKeyValuePairs(ann, [
        { field_key: "name", field_type: "string" },
        { field_key: "total", field_type: "number" },
      ]);
    expect(documents?.[0].docType).toBe("mistral-template");
    expect(documents?.[0].fields.name?.valueString).toBe("Acme");
    expect(documents?.[0].fields.total?.valueNumber).toBe(100);
    expect(keyValuePairs).toHaveLength(2);
  });
});
