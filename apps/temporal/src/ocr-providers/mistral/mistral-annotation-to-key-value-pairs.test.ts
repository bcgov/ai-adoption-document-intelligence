import { mistralDocumentAnnotationToKeyValuePairs } from "./mistral-annotation-to-key-value-pairs";

describe("mistralDocumentAnnotationToKeyValuePairs", () => {
  it("returns empty for null or invalid JSON", () => {
    expect(mistralDocumentAnnotationToKeyValuePairs(null)).toEqual([]);
    expect(mistralDocumentAnnotationToKeyValuePairs("")).toEqual([]);
    expect(mistralDocumentAnnotationToKeyValuePairs("not json")).toEqual([]);
    expect(mistralDocumentAnnotationToKeyValuePairs("[]")).toEqual([]);
  });

  it("maps object properties to KeyValuePair rows", () => {
    const pairs = mistralDocumentAnnotationToKeyValuePairs(
      JSON.stringify({ a: "1", b: 2 }),
    );
    expect(pairs).toHaveLength(2);
    const byKey = new Map(pairs.map((p) => [p.key.content, p.value?.content]));
    expect(byKey.get("a")).toBe("1");
    expect(byKey.get("b")).toBe("2");
    expect(pairs[0].confidence).toBe(1);
  });
});
