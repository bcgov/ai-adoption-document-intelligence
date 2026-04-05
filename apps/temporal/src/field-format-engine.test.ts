import {
  canonicalize,
  type FormatSpec,
  format,
  parseFormatSpec,
  validate,
} from "./field-format-engine";

describe("field-format-engine", () => {
  describe("parseFormatSpec", () => {
    it("returns null for null input", () => {
      expect(parseFormatSpec(null)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseFormatSpec("")).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(parseFormatSpec("{not valid json}")).toBeNull();
    });

    it("returns null when canonicalize field is missing", () => {
      expect(parseFormatSpec('{"pattern": "^\\\\d+$"}')).toBeNull();
    });

    it("returns null when canonicalize is not a string", () => {
      expect(parseFormatSpec('{"canonicalize": 42}')).toBeNull();
    });

    it("parses a minimal valid spec with only canonicalize", () => {
      const result = parseFormatSpec('{"canonicalize": "digits"}');
      expect(result).toEqual({ canonicalize: "digits" });
    });

    it("parses spec with pattern", () => {
      const result = parseFormatSpec(
        '{"canonicalize": "digits", "pattern": "^\\\\d{9}$"}',
      );
      expect(result).toEqual({ canonicalize: "digits", pattern: "^\\d{9}$" });
    });

    it("parses spec with displayTemplate", () => {
      const result = parseFormatSpec(
        '{"canonicalize": "digits", "displayTemplate": "###-###-###"}',
      );
      expect(result).toEqual({
        canonicalize: "digits",
        displayTemplate: "###-###-###",
      });
    });

    it("parses spec with all fields", () => {
      const result = parseFormatSpec(
        '{"canonicalize": "uppercase|strip-spaces", "pattern": "^[A-Z0-9]+$", "displayTemplate": "AAA###"}',
      );
      expect(result).toEqual({
        canonicalize: "uppercase|strip-spaces",
        pattern: "^[A-Z0-9]+$",
        displayTemplate: "AAA###",
      });
    });
  });

  describe("canonicalize", () => {
    const spec = (c: string): FormatSpec => ({ canonicalize: c });

    it("digits — strips non-digit characters", () => {
      expect(canonicalize("123-456-789", spec("digits"))).toBe("123456789");
      expect(canonicalize("(604) 555-1234", spec("digits"))).toBe("6045551234");
    });

    it("uppercase — converts to upper case", () => {
      expect(canonicalize("hello world", spec("uppercase"))).toBe(
        "HELLO WORLD",
      );
    });

    it("lowercase — converts to lower case", () => {
      expect(canonicalize("Hello World", spec("lowercase"))).toBe(
        "hello world",
      );
    });

    it("strip-spaces — removes all whitespace", () => {
      expect(canonicalize("A B\tC\nD", spec("strip-spaces"))).toBe("ABCD");
    });

    it("text — collapses whitespace, trims, removes space before punctuation", () => {
      expect(canonicalize("  hello   world  ", spec("text"))).toBe(
        "hello world",
      );
      expect(canonicalize("Hello , world .", spec("text"))).toBe(
        "Hello, world.",
      );
      expect(canonicalize("Wait ; what : now ! really ?", spec("text"))).toBe(
        "Wait; what: now! really?",
      );
    });

    it("number — strips currency symbols, commas, and spaces", () => {
      expect(canonicalize("$1,234.56", spec("number"))).toBe("1234.56");
      expect(canonicalize("£ 2,000", spec("number"))).toBe("2000");
      expect(canonicalize("€1.500,00", spec("number"))).toBe("1.50000");
      expect(canonicalize("¥10,000", spec("number"))).toBe("10000");
    });

    it("date:YYYY-MM-DD — outputs ISO date", () => {
      expect(canonicalize("30/03/2016", spec("date:YYYY-MM-DD"))).toBe(
        "2016-03-30",
      );
      expect(canonicalize("2016-Mar-30", spec("date:YYYY-MM-DD"))).toBe(
        "2016-03-30",
      );
    });

    it("date:DD/MM/YYYY — outputs day-first date", () => {
      expect(canonicalize("2016-03-30", spec("date:DD/MM/YYYY"))).toBe(
        "30/03/2016",
      );
    });

    it("date:MM/DD/YYYY — outputs month-first date", () => {
      expect(canonicalize("2016-03-30", spec("date:MM/DD/YYYY"))).toBe(
        "03/30/2016",
      );
    });

    it("date — returns original value when unparseable", () => {
      expect(canonicalize("not a date", spec("date:YYYY-MM-DD"))).toBe(
        "not a date",
      );
    });

    it("noop — passes value through unchanged", () => {
      expect(canonicalize("hello World 123", spec("noop"))).toBe(
        "hello World 123",
      );
    });

    it("chains multiple operations left to right", () => {
      expect(
        canonicalize("  Hello World  ", spec("uppercase|strip-spaces")),
      ).toBe("HELLOWORLD");
    });

    it("chains digits then more ops", () => {
      expect(canonicalize("(604) 555-1234", spec("digits"))).toBe("6045551234");
    });

    it("handles empty string", () => {
      expect(canonicalize("", spec("digits"))).toBe("");
      expect(canonicalize("", spec("uppercase"))).toBe("");
      expect(canonicalize("", spec("text"))).toBe("");
      expect(canonicalize("", spec("noop"))).toBe("");
    });
  });

  describe("validate", () => {
    it("returns valid when spec has no pattern", () => {
      const spec: FormatSpec = { canonicalize: "digits" };
      expect(validate("anything", spec)).toEqual({ valid: true });
    });

    it("returns valid for empty value even with pattern", () => {
      const spec: FormatSpec = { canonicalize: "digits", pattern: "^\\d{9}$" };
      expect(validate("", spec)).toEqual({ valid: true });
    });

    it("returns valid when canonicalized value matches pattern", () => {
      const spec: FormatSpec = { canonicalize: "digits", pattern: "^\\d{9}$" };
      expect(validate("123-456-789", spec)).toEqual({ valid: true });
    });

    it("returns invalid with message when value does not match pattern", () => {
      const spec: FormatSpec = { canonicalize: "digits", pattern: "^\\d{9}$" };
      const result = validate("123-456", spec);
      expect(result.valid).toBe(false);
      expect(result.message).toBeDefined();
    });

    it("validates a postal code", () => {
      const spec: FormatSpec = {
        canonicalize: "uppercase|strip-spaces",
        pattern: "^[A-Z]\\d[A-Z]\\d[A-Z]\\d$",
      };
      expect(validate("V6B 1A1", spec)).toEqual({ valid: true });
      expect(validate("invalid", spec).valid).toBe(false);
    });
  });

  describe("format", () => {
    it("returns canonicalized value when no displayTemplate", () => {
      const spec: FormatSpec = { canonicalize: "digits" };
      expect(format("123-456-789", spec)).toBe("123456789");
    });

    it("applies digit placeholder template", () => {
      const spec: FormatSpec = {
        canonicalize: "digits",
        displayTemplate: "###-###-###",
      };
      expect(format("123-456-789", spec)).toBe("123-456-789");
    });

    it("applies letter placeholder template", () => {
      const spec: FormatSpec = {
        canonicalize: "uppercase|strip-spaces",
        displayTemplate: "AAA ###",
      };
      expect(format("abc123", spec)).toBe("ABC 123");
    });

    it("returns canonicalized value when placeholder count does not match", () => {
      const spec: FormatSpec = {
        canonicalize: "digits",
        displayTemplate: "###-###",
      };
      // 9 digits, but template only has 6 placeholders
      expect(format("123456789", spec)).toBe("123456789");
    });

    it("returns canonicalized value for empty string with template", () => {
      const spec: FormatSpec = {
        canonicalize: "digits",
        displayTemplate: "###-###-###",
      };
      expect(format("", spec)).toBe("");
    });

    it("formats a date with YYYY-MM-DD canonicalization", () => {
      const spec: FormatSpec = {
        canonicalize: "date:YYYY-MM-DD",
        displayTemplate: "####-##-##",
      };
      expect(format("30/03/2016", spec)).toBe("2016-03-30");
    });
  });
});
