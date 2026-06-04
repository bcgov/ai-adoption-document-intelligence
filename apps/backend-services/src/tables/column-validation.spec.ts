import { buildRowZodSchema, validateColumnDefs } from "./column-validation";
import type { ColumnDef } from "./types";

describe("validateColumnDefs", () => {
  it("accepts a valid column array", () => {
    const cols: ColumnDef[] = [
      {
        key: "schedule_id",
        label: "Schedule ID",
        type: "string",
        required: true,
      },
      { key: "issue_day", label: "Issue Day", type: "date" },
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

  it("rejects enum with empty enumValues array", () => {
    const cols: ColumnDef[] = [
      { key: "k", label: "K", type: "enum", enumValues: [] },
    ];
    expect(() => validateColumnDefs(cols)).toThrow(/enumValues required/i);
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

  it("accepts a valid ISO datetime with offset", () => {
    const schema = buildRowZodSchema([
      { key: "ts", label: "TS", type: "datetime", required: true },
    ]);
    expect(() => schema.parse({ ts: "2026-04-22T14:30:00Z" })).not.toThrow();
    expect(() =>
      schema.parse({ ts: "2026-04-22T14:30:00+05:00" }),
    ).not.toThrow();
  });

  it("rejects a bare date for datetime type", () => {
    const schema = buildRowZodSchema([
      { key: "ts", label: "TS", type: "datetime", required: true },
    ]);
    expect(() => schema.parse({ ts: "2026-04-22" })).toThrow();
  });

  it("accepts a valid year-month string", () => {
    const schema = buildRowZodSchema([
      { key: "ym", label: "YM", type: "year-month", required: true },
    ]);
    expect(() => schema.parse({ ym: "2026-04" })).not.toThrow();
  });

  it("rejects a full date for year-month type", () => {
    const schema = buildRowZodSchema([
      { key: "ym", label: "YM", type: "year-month", required: true },
    ]);
    expect(() => schema.parse({ ym: "2026-04-22" })).toThrow();
  });
});
