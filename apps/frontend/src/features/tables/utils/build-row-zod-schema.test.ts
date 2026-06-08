import { describe, expect, it } from "vitest";
import { buildRowZodSchema } from "./build-row-zod-schema";

describe("buildRowZodSchema (frontend)", () => {
  it("validates required string", () => {
    const s = buildRowZodSchema([
      { key: "n", label: "N", type: "string", required: true },
    ]);
    expect(() => s.parse({})).toThrow();
    expect(s.parse({ n: "x" })).toEqual({ n: "x" });
  });

  it("validates enum membership", () => {
    const s = buildRowZodSchema([
      {
        key: "k",
        label: "K",
        type: "enum",
        enumValues: ["a", "b"],
        required: true,
      },
    ]);
    expect(() => s.parse({ k: "c" })).toThrow();
    expect(s.parse({ k: "a" })).toEqual({ k: "a" });
  });

  it("validates date format YYYY-MM-DD", () => {
    const s = buildRowZodSchema([
      { key: "d", label: "D", type: "date", required: true },
    ]);
    expect(() => s.parse({ d: new Date() })).toThrow();
    expect(() => s.parse({ d: "2026-12-31" })).not.toThrow();
  });

  it("strips unknown fields", () => {
    const s = buildRowZodSchema([
      { key: "n", label: "N", type: "string", required: true },
    ]);
    expect(s.parse({ n: "x", extra: "y" })).toEqual({ n: "x" });
  });

  it("optional fields can be omitted", () => {
    const s = buildRowZodSchema([{ key: "n", label: "N", type: "string" }]);
    expect(s.parse({})).toEqual({});
    expect(s.parse({ n: "x" })).toEqual({ n: "x" });
  });

  it("throws when enum has no enumValues", () => {
    expect(() =>
      buildRowZodSchema([
        { key: "k", label: "K", type: "enum", required: true },
      ]),
    ).toThrow(/enumValues/i);
  });

  it("validates year-month format YYYY-MM-DD", () => {
    const s = buildRowZodSchema([
      { key: "ym", label: "YM", type: "year-month", required: true },
    ]);
    expect(() => s.parse({ ym: new Date() })).toThrow();
    expect(() => s.parse({ ym: "2026-05-01" })).not.toThrow();
    expect(() => s.parse({ ym: "2026-05" })).toThrow();
  });

  it("allows null for optional year-month", () => {
    const s = buildRowZodSchema([
      { key: "ym", label: "YM", type: "year-month" },
    ]);
    expect(() => s.parse({ ym: null })).not.toThrow();
    expect(() => s.parse({})).not.toThrow();
  });

  it("allows null for optional datetime", () => {
    const s = buildRowZodSchema([{ key: "dt", label: "DT", type: "datetime" }]);
    expect(() => s.parse({ dt: null })).not.toThrow();
    expect(() => s.parse({ dt: "2026-05-21 10:30:00" })).not.toThrow();
    expect(() => s.parse({ dt: new Date() })).toThrow();
  });
});
