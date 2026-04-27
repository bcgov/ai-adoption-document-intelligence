import { parse } from "csv/sync";
import { IterationResult } from "./binding-resolver";
import { CsvRenderError, renderCsv } from "./csv-renderer";

describe("renderCsv - headers", () => {
  it("produces the mapping keys as the first (header) row", () => {
    const mapping = { FirstName: "Alice", CaseID: "123" };
    const result = renderCsv(mapping);
    const lines = result.trim().split("\n");
    expect(lines[0]).toBe("FirstName,CaseID");
  });

  it("preserves key order as column order", () => {
    const mapping = { Z: "last", A: "first", M: "middle" };
    const result = renderCsv(mapping);
    const lines = result.trim().split("\n");
    expect(lines[0]).toBe("Z,A,M");
  });
});

describe("renderCsv - data row", () => {
  it("produces the resolved values as the second (data) row", () => {
    const mapping = { FirstName: "Alice", CaseID: "123" };
    const result = renderCsv(mapping);
    const lines = result.trim().split("\n");
    expect(lines[1]).toBe("Alice,123");
  });

  it("handles numeric values", () => {
    const mapping = { id: 42, score: 3.14 };
    const result = renderCsv(mapping);
    const lines = result.trim().split("\n");
    expect(lines[1]).toBe("42,3.14");
  });

  it("handles boolean values", () => {
    const mapping = { active: true, deleted: false };
    const result = renderCsv(mapping);
    const lines = result.trim().split("\n");
    expect(lines[1]).toBe("true,false");
  });

  it("handles null values as empty cells", () => {
    const mapping: Record<string, unknown> = { name: "Alice", note: null };
    const result = renderCsv(mapping);
    const lines = result.trim().split("\n");
    expect(lines[1]).toBe("Alice,");
  });
});

describe("renderCsv - RFC 4180 escaping", () => {
  it("quotes a value containing a comma", () => {
    const mapping = { Name: "Smith, Alice", ID: "001" };
    const result = renderCsv(mapping);
    expect(result).toContain('"Smith, Alice"');
  });

  it("quotes and escapes a value containing a double-quote", () => {
    const mapping = { Quote: 'He said "hello"', ID: "002" };
    const result = renderCsv(mapping);
    expect(result).toContain('"He said ""hello"""');
  });

  it("quotes a value containing a newline", () => {
    const mapping = { Notes: "line1\nline2", ID: "003" };
    const result = renderCsv(mapping);
    expect(result).toContain('"line1\nline2"');
  });
});

describe("renderCsv - parseable output", () => {
  it("produces output that can be re-parsed by csv-parse into the original mapping", () => {
    const mapping = { FirstName: "Alice", CaseID: "123", Score: "99" };
    const csv = renderCsv(mapping);
    const rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ FirstName: "Alice", CaseID: "123", Score: "99" });
  });

  it("round-trips a value with commas through parse", () => {
    const mapping = { Name: "Smith, Alice", ID: "001" };
    const csv = renderCsv(mapping);
    const rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    expect(rows[0]).toEqual({ Name: "Smith, Alice", ID: "001" });
  });

  it("round-trips a value with double-quotes through parse", () => {
    const mapping = { Quote: 'say "hi"', ID: "002" };
    const csv = renderCsv(mapping);
    const rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    expect(rows[0]).toEqual({ Quote: 'say "hi"', ID: "002" });
  });
});

describe("renderCsv - rendering failure", () => {
  it("throws CsvRenderError when a value is a plain object", () => {
    const mapping: Record<string, unknown> = {
      Name: "Alice",
      Address: { street: "123 Main St" },
    };
    expect(() => renderCsv(mapping)).toThrow(CsvRenderError);
    expect(() => renderCsv(mapping)).toThrow("Failed to render CSV output:");
  });

  it("throws CsvRenderError when a value is an array", () => {
    const mapping: Record<string, unknown> = {
      Name: "Alice",
      Tags: ["a", "b"],
    };
    expect(() => renderCsv(mapping)).toThrow(CsvRenderError);
  });

  it("CsvRenderError exposes the detail property with diagnostic information", () => {
    const mapping: Record<string, unknown> = {
      Name: "Alice",
      Nested: { deep: true },
    };
    try {
      renderCsv(mapping);
      fail("expected error to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CsvRenderError);
      expect((err as CsvRenderError).detail).toContain("Nested");
    }
  });
});

// ---------------------------------------------------------------------------
// US-008: Scenario 5 — CSV output produces additional data rows per iteration
// ---------------------------------------------------------------------------
describe("renderCsv - iteration support", () => {
  it("produces a header row and one data row per iteration element", () => {
    const mapping = {
      Records: new IterationResult([
        { Name: "Alice", Value: "1" },
        { Name: "Bob", Value: "2" },
      ]),
    };

    const result = renderCsv(mapping);
    const rows = parse(result, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Name: "Alice", Value: "1" });
    expect(rows[1]).toEqual({ Name: "Bob", Value: "2" });
  });

  it("produces correct headers from the iteration template's keys", () => {
    const mapping = {
      Data: new IterationResult([{ FirstName: "Carol", Score: "95" }]),
    };

    const result = renderCsv(mapping);
    const lines = result.trim().split("\n");

    expect(lines[0]).toBe("FirstName,Score");
  });

  it("produces an empty string for an empty IterationResult", () => {
    const mapping = {
      Items: new IterationResult([]),
    };

    const result = renderCsv(mapping);
    expect(result).toBe("");
  });

  it("throws CsvRenderError when an iteration item contains a non-primitive value", () => {
    const mapping = {
      Items: new IterationResult([
        { Name: "Alice", Nested: { deep: true } } as Record<string, unknown>,
      ]),
    };

    expect(() => renderCsv(mapping)).toThrow(CsvRenderError);
    expect(() => renderCsv(mapping)).toThrow("Failed to render CSV output:");
  });
});

describe("renderCsv - mixed mapping validation", () => {
  it("throws CsvRenderError when an iteration block is mixed with a single flat key", () => {
    const mapping: Record<string, unknown> = {
      reportName: "Daily",
      rows: new IterationResult([{ sku: "A1", qty: "10" }]),
    };

    expect(() => renderCsv(mapping)).toThrow(CsvRenderError);
    expect(() => renderCsv(mapping)).toThrow('"reportName"');
  });

  it("throws CsvRenderError listing all dropped keys when multiple flat keys are mixed with an iteration", () => {
    const mapping: Record<string, unknown> = {
      reportName: "Daily",
      generatedAt: "2026-01-01",
      rows: new IterationResult([{ sku: "A1", qty: "10" }]),
    };

    const run = () => renderCsv(mapping);
    expect(run).toThrow(CsvRenderError);
    expect(run).toThrow('"reportName"');
    expect(run).toThrow('"generatedAt"');
  });

  it("throws CsvRenderError when the mapping contains multiple iteration blocks", () => {
    const mapping: Record<string, unknown> = {
      orders: new IterationResult([{ id: "1" }]),
      returns: new IterationResult([{ id: "2" }]),
    };

    expect(() => renderCsv(mapping)).toThrow(CsvRenderError);
    expect(() => renderCsv(mapping)).toThrow('"orders"');
    expect(() => renderCsv(mapping)).toThrow('"returns"');
  });

  it("still succeeds with only an iteration block and no flat keys", () => {
    const mapping = {
      rows: new IterationResult([
        { name: "Alice", score: "95" },
        { name: "Bob", score: "88" },
      ]),
    };

    expect(() => renderCsv(mapping)).not.toThrow();
    const result = renderCsv(mapping);
    expect(result).toContain("name,score");
  });

  it("still succeeds with only flat keys and no iteration", () => {
    const mapping = { name: "Alice", score: "95" };

    expect(() => renderCsv(mapping)).not.toThrow();
    const result = renderCsv(mapping);
    expect(result).toContain("name,score");
  });
});
