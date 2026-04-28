import { buildRowZodSchema, validateColumnDefs } from "./column-validation";
import type { ColumnDef } from "./types";

describe("validateColumnDefs", () => {
  it("accepts a valid column array", () => {
    const cols: ColumnDef[] = [
      {
        key: "scheduleId",
        label: "Schedule ID",
        type: "string",
        required: true,
      },
      { key: "issueDay", label: "Issue Day", type: "date" },
    ];
    expect(() => validateColumnDefs(cols)).not.toThrow();
  });

  it("rejects duplicate keys", () => {
    const cols: ColumnDef[] = [
      { key: "x", label: "X", type: "string" },
      { key: "x", label: "X2", type: "number" },
    ];
    expect(() => validateColumnDefs(cols)).toThrow(/duplicate column key/i);
  });

  it("rejects keys not matching identifier pattern", () => {
    const cols: ColumnDef[] = [{ key: "1bad", label: "Bad", type: "string" }];
    expect(() => validateColumnDefs(cols)).toThrow(/invalid column key/i);
  });

  it("rejects enum without enumValues", () => {
    const cols: ColumnDef[] = [{ key: "k", label: "K", type: "enum" }];
    expect(() => validateColumnDefs(cols)).toThrow(/enumValues required/i);
  });

  it("rejects non-enum with enumValues", () => {
    const cols: ColumnDef[] = [
      { key: "k", label: "K", type: "string", enumValues: ["a"] },
    ];
    expect(() => validateColumnDefs(cols)).toThrow(/enumValues only allowed/i);
  });
});

describe("buildRowZodSchema", () => {
  const cols: ColumnDef[] = [
    { key: "name", label: "Name", type: "string", required: true },
    { key: "count", label: "Count", type: "number" },
    { key: "active", label: "Active", type: "boolean" },
    { key: "issued", label: "Issued", type: "date" },
    { key: "kind", label: "Kind", type: "enum", enumValues: ["a", "b"] },
  ];

  it("accepts valid row data", () => {
    const schema = buildRowZodSchema(cols);
    const result = schema.parse({
      name: "x",
      count: 5,
      active: true,
      issued: "2026-01-15",
      kind: "a",
    });
    expect(result.name).toBe("x");
  });

  it("strips unknown keys", () => {
    const schema = buildRowZodSchema(cols);
    const result = schema.parse({ name: "x", extra: "ignored" }) as Record<
      string,
      unknown
    >;
    expect(result.extra).toBeUndefined();
  });

  it("rejects missing required field", () => {
    const schema = buildRowZodSchema(cols);
    expect(() => schema.parse({})).toThrow();
  });

  it("rejects wrong type", () => {
    const schema = buildRowZodSchema(cols);
    expect(() => schema.parse({ name: 5 })).toThrow();
  });

  it("rejects enum value not in enumValues", () => {
    const schema = buildRowZodSchema(cols);
    expect(() => schema.parse({ name: "x", kind: "c" })).toThrow();
  });
});
