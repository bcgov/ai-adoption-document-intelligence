import { InputParseError, parseInput } from "./input-parser";

describe("parseInput - JSON format", () => {
  it("parses a valid JSON object string", () => {
    const input = '{"name":"Alice","age":30}';
    const result = parseInput(input, "json");
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("parses a valid JSON array string", () => {
    const input = '[{"id":1},{"id":2}]';
    const result = parseInput(input, "json");
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("throws InputParseError for malformed JSON", () => {
    expect(() => parseInput("{not valid json}", "json")).toThrow(
      InputParseError,
    );
    expect(() => parseInput("{not valid json}", "json")).toThrow(
      "Failed to parse json input:",
    );
  });

  it("throws InputParseError for a JSON primitive (non-object/array)", () => {
    expect(() => parseInput("42", "json")).toThrow(InputParseError);
  });
});

describe("parseInput - XML format", () => {
  it("parses a simple XML document into a nested object", () => {
    const input = "<root><name>Alice</name><age>30</age></root>";
    const result = parseInput(input, "xml") as Record<string, unknown>;
    expect(result).toHaveProperty("root");
    const root = result.root as Record<string, unknown>;
    expect(root.name).toBe("Alice");
    expect(root.age).toBe(30);
  });

  it("preserves nesting in XML", () => {
    const input = "<root><person><name>Bob</name></person></root>";
    const result = parseInput(input, "xml") as Record<string, unknown>;
    expect(result).toHaveProperty("root");
    const root = result.root as Record<string, unknown>;
    expect(root).toHaveProperty("person");
    const person = root.person as Record<string, unknown>;
    expect(person.name).toBe("Bob");
  });

  it("throws InputParseError for malformed XML", () => {
    expect(() => parseInput("not xml at all", "xml")).toThrow(InputParseError);
    expect(() => parseInput("not xml at all", "xml")).toThrow(
      "Failed to parse xml input:",
    );
  });
});

describe("parseInput - CSV format", () => {
  it("parses a valid CSV string into an array of objects", () => {
    const input = "name,age\nAlice,30\nBob,25";
    const result = parseInput(input, "csv") as Record<string, string>[];
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Alice", age: "30" });
    expect(result[1]).toEqual({ name: "Bob", age: "25" });
  });

  it("handles CSV with leading/trailing whitespace in values", () => {
    const input = "name , age\n Alice , 30 ";
    const result = parseInput(input, "csv") as Record<string, string>[];
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "Alice", age: "30" });
  });

  it("throws InputParseError for malformed CSV (mismatched columns)", () => {
    // Extra column value with no matching header causes a parse error
    const input = "a,b\n1,2,3,4,5\n6,7,8,9,10";
    expect(() => parseInput(input, "csv")).toThrow(InputParseError);
    expect(() => parseInput(input, "csv")).toThrow(
      "Failed to parse csv input:",
    );
  });
});

describe("parseInput - empty input", () => {
  it.each([
    "json",
    "xml",
    "csv",
  ] as const)("throws InputParseError for empty string with format %s", (format) => {
    expect(() => parseInput("", format)).toThrow(InputParseError);
    expect(() => parseInput("", format)).toThrow(
      `Failed to parse ${format} input:`,
    );
  });

  it.each([
    "json",
    "xml",
    "csv",
  ] as const)("throws InputParseError for whitespace-only string with format %s", (format) => {
    expect(() => parseInput("   ", format)).toThrow(InputParseError);
  });
});
