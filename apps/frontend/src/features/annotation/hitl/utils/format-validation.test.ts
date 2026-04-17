import { describe, expect, it } from "vitest";
import {
  buildFieldValidators,
  parseFormatSpec,
  validateFieldValue,
} from "./format-validation";

describe("parseFormatSpec", () => {
  it("returns null for null/empty", () => {
    expect(parseFormatSpec(null)).toBeNull();
    expect(parseFormatSpec("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseFormatSpec("not json")).toBeNull();
  });

  it("returns null when canonicalize is missing", () => {
    expect(parseFormatSpec('{"pattern": "^\\\\d+$"}')).toBeNull();
  });

  it("parses valid JSON spec", () => {
    expect(
      parseFormatSpec('{"canonicalize": "digits", "pattern": "^\\\\d{9}$"}'),
    ).toEqual({ canonicalize: "digits", pattern: "^\\d{9}$" });
  });

  it("parses a spec with displayTemplate", () => {
    const spec = parseFormatSpec(
      '{"canonicalize": "digits", "pattern": "^\\\\d{9,10}$", "displayTemplate": "(###) ###-###"}',
    );
    expect(spec).toEqual({
      canonicalize: "digits",
      pattern: "^\\d{9,10}$",
      displayTemplate: "(###) ###-###",
    });
  });

  it("parses a composable canonicalize spec", () => {
    const spec = parseFormatSpec(
      '{"canonicalize": "uppercase|strip-spaces", "pattern": "^[A-Z]\\\\d[A-Z]\\\\d[A-Z]\\\\d$"}',
    );
    expect(spec).toEqual({
      canonicalize: "uppercase|strip-spaces",
      pattern: "^[A-Z]\\d[A-Z]\\d[A-Z]\\d$",
    });
  });
});

describe("validateFieldValue", () => {
  it("returns null (no error) when value matches format", () => {
    const spec = { canonicalize: "digits", pattern: "^\\d{9}$" };
    expect(validateFieldValue("872 318 748", spec)).toBeNull();
  });

  it("returns error message when value does not match", () => {
    const spec = { canonicalize: "digits", pattern: "^\\d{9}$" };
    expect(validateFieldValue("12345", spec)).toBe(
      "Value does not match expected pattern",
    );
  });

  it("returns null for empty value", () => {
    const spec = { canonicalize: "digits", pattern: "^\\d{9}$" };
    expect(validateFieldValue("", spec)).toBeNull();
  });

  it("returns null when no pattern defined", () => {
    const spec = { canonicalize: "text" };
    expect(validateFieldValue("anything", spec)).toBeNull();
  });

  it("validates date fields -- valid date in any parseable format", () => {
    const spec = { canonicalize: "date:YYYY-MM-DD" };
    expect(validateFieldValue("2009-Apr-22", spec)).toBeNull();
    expect(validateFieldValue("04/22/2009", spec)).toBeNull();
    expect(validateFieldValue("2009-04-22", spec)).toBeNull();
  });

  it("returns error for unparseable date", () => {
    const spec = { canonicalize: "date:YYYY-MM-DD" };
    expect(validateFieldValue("not a date", spec)).toBe(
      "Value could not be parsed in the expected format",
    );
  });

  it("validates date with pattern", () => {
    const spec = {
      canonicalize: "date:YYYY-MM-DD",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    };
    expect(validateFieldValue("2009-Apr-22", spec)).toBeNull();
    expect(validateFieldValue("not a date", spec)).toBe(
      "Value could not be parsed in the expected format",
    );
  });
});

describe("buildFieldValidators", () => {
  it("builds validators map from field definitions with patterns", () => {
    const fieldDefs = [
      {
        field_key: "sin",
        format_spec: '{"canonicalize": "digits", "pattern": "^\\\\d{9}$"}',
      },
      { field_key: "name", format_spec: null },
    ];
    const validators = buildFieldValidators(fieldDefs);
    expect(validators.sin).toBeDefined();
    expect(validators.name).toBeUndefined();
    expect(validators.sin!("872 318 748")).toBeNull();
    expect(validators.sin!("12345")).toBe(
      "Value does not match expected pattern",
    );
  });

  it("builds validators for date fields even without pattern", () => {
    const fieldDefs = [
      {
        field_key: "date",
        format_spec: '{"canonicalize": "date:YYYY-MM-DD"}',
      },
    ];
    const validators = buildFieldValidators(fieldDefs);
    expect(validators.date).toBeDefined();
    expect(validators.date!("2009-Apr-22")).toBeNull();
    expect(validators.date!("not a date")).toBe(
      "Value could not be parsed in the expected format",
    );
  });
});
