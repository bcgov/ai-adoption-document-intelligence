/**
 * Tests for the ctx editor's default-value text ⇄ value conversion (P-5).
 *
 * The split that matters: a `string` default is taken verbatim (typing
 * `image` must not require quotes) while every other type parses as JSON and
 * is checked against the declared type, because a `number` default stored as
 * `"3"` passes the editor and then fails `validateRunInput`'s `typeof` check
 * at run time.
 */
import { describe, expect, it } from "vitest";
import {
  formatCtxDefaultValue,
  parseCtxDefaultValue,
} from "./ctx-default-value";

describe("parseCtxDefaultValue", () => {
  it("takes a string default verbatim, quotes and all not required", () => {
    expect(parseCtxDefaultValue("image", "string")).toEqual({
      ok: true,
      value: "image",
    });
    expect(parseCtxDefaultValue('{"not":"json"}', "string")).toEqual({
      ok: true,
      value: '{"not":"json"}',
    });
  });

  it("treats a blank field as no default at all", () => {
    expect(parseCtxDefaultValue("", "string")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(parseCtxDefaultValue("   ", "number")).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("parses the non-string types as JSON", () => {
    expect(parseCtxDefaultValue("3", "number")).toEqual({ ok: true, value: 3 });
    expect(parseCtxDefaultValue("true", "boolean")).toEqual({
      ok: true,
      value: true,
    });
    expect(parseCtxDefaultValue('["a"]', "array")).toEqual({
      ok: true,
      value: ["a"],
    });
    expect(parseCtxDefaultValue('{"a":1}', "object")).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  it("reports unparseable JSON rather than storing the text", () => {
    const result = parseCtxDefaultValue("{a:", "object");
    expect(result.ok).toBe(false);
  });

  it("refuses a parsed value whose shape contradicts the declared type", () => {
    expect(parseCtxDefaultValue('"3"', "number")).toEqual({
      ok: false,
      error: "Expected a number",
    });
    expect(parseCtxDefaultValue("[]", "object")).toEqual({
      ok: false,
      error: "Expected a JSON object",
    });
    expect(parseCtxDefaultValue("null", "object")).toEqual({
      ok: false,
      error: "Expected a JSON object",
    });
    expect(parseCtxDefaultValue("{}", "array")).toEqual({
      ok: false,
      error: "Expected a JSON array",
    });
  });
});

describe("formatCtxDefaultValue", () => {
  it("round-trips every value parse can produce", () => {
    expect(formatCtxDefaultValue(undefined, "string")).toBe("");
    expect(formatCtxDefaultValue("image", "string")).toBe("image");
    expect(formatCtxDefaultValue(3, "number")).toBe("3");
    expect(formatCtxDefaultValue(true, "boolean")).toBe("true");
    expect(formatCtxDefaultValue({ a: 1 }, "object")).toBe('{"a":1}');
  });

  it("shows a value the declared type no longer matches as JSON rather than blanking it", () => {
    expect(formatCtxDefaultValue(3, "string")).toBe("3");
  });
});
