import { JsonRenderError, renderJson } from "./json-renderer";

describe("renderJson - flat mapping", () => {
  it("serializes a flat resolved mapping to a valid JSON string", () => {
    const mapping = { FirstName: "Alice", CaseID: "123" };
    const result = renderJson(mapping);
    expect(JSON.parse(result)).toEqual({ FirstName: "Alice", CaseID: "123" });
  });

  it("round-trips through JSON.parse back to the original object", () => {
    const mapping = { a: "hello", b: 42, c: true, d: null };
    const result = renderJson(mapping);
    expect(JSON.parse(result)).toEqual(mapping);
  });
});

describe("renderJson - nested mapping", () => {
  it("serializes nested objects preserving structure", () => {
    const mapping = { Person: { Name: "Alice", Age: 30 } };
    const result = renderJson(mapping);
    expect(JSON.parse(result)).toEqual({ Person: { Name: "Alice", Age: 30 } });
  });

  it("serializes deeply nested objects", () => {
    const mapping = { a: { b: { c: { d: "deep" } } } };
    const result = renderJson(mapping);
    expect(JSON.parse(result)).toEqual({ a: { b: { c: { d: "deep" } } } });
  });
});

describe("renderJson - array values", () => {
  it("serializes a mapping containing an array value", () => {
    const mapping = { items: ["x", "y", "z"] };
    const result = renderJson(mapping);
    expect(JSON.parse(result)).toEqual({ items: ["x", "y", "z"] });
  });

  it("serializes a mapping with an array of objects", () => {
    const mapping = {
      rows: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    };
    const result = renderJson(mapping);
    expect(JSON.parse(result)).toEqual(mapping);
  });
});

describe("renderJson - rendering failure", () => {
  it("throws JsonRenderError for circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj; // circular reference

    expect(() => renderJson(obj)).toThrow(JsonRenderError);
    expect(() => renderJson(obj)).toThrow("Failed to render JSON output:");
  });

  it("JsonRenderError exposes the detail property", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;

    try {
      renderJson(obj);
      fail("expected error to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRenderError);
      expect((err as JsonRenderError).detail).toBeTruthy();
    }
  });
});
