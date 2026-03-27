import {
  digitsOnly,
  formatCanonicalDateLabel,
  isDateLikeFieldKey,
  isIdentifierLikeFieldKey,
  parseToCalendarParts,
  shouldCoerceDateFieldNoiseToEmpty,
  tryCanonicalDateString,
} from "./form-field-normalization";

describe("form-field-normalization", () => {
  describe("field key patterns", () => {
    it("detects identifier-like keys", () => {
      expect(isIdentifierLikeFieldKey("sin")).toBe(true);
      expect(isIdentifierLikeFieldKey("spouse_phone")).toBe(true);
      expect(isIdentifierLikeFieldKey("applicant_sin")).toBe(true);
      expect(isIdentifierLikeFieldKey("assassin")).toBe(false);
      expect(isIdentifierLikeFieldKey("name")).toBe(false);
    });

    it("detects date-like keys", () => {
      expect(isDateLikeFieldKey("date")).toBe(true);
      expect(isDateLikeFieldKey("spouse_date")).toBe(true);
      expect(isDateLikeFieldKey("ShipDate")).toBe(false);
      expect(isDateLikeFieldKey("updated_at")).toBe(false);
    });
  });

  describe("digitsOnly", () => {
    it("strips non-digits", () => {
      expect(digitsOnly("936-688-868")).toBe("936688868");
      expect(digitsOnly("970.838.608")).toBe("970838608");
    });
  });

  describe("parseToCalendarParts / tryCanonicalDateString", () => {
    it("parses DD/MM/YYYY", () => {
      const p = parseToCalendarParts("30/03/2016");
      expect(p).toEqual({ y: 2016, m: 3, day: 30 });
      expect(tryCanonicalDateString("30/03/2016")).toBe("2016-Mar-30");
    });

    it("parses YYYY-Mmm-DD ground-truth style", () => {
      expect(tryCanonicalDateString("2016-Mar-30")).toBe("2016-Mar-30");
    });

    it("parses YYYY-MM-DD", () => {
      expect(tryCanonicalDateString("2016-03-30")).toBe("2016-Mar-30");
    });

    it("returns null for non-dates", () => {
      expect(tryCanonicalDateString("$")).toBeNull();
      expect(tryCanonicalDateString("")).toBeNull();
    });
  });

  describe("formatCanonicalDateLabel", () => {
    it("pads day", () => {
      expect(formatCanonicalDateLabel({ y: 2016, m: 3, day: 5 })).toBe(
        "2016-Mar-05",
      );
    });
  });

  describe("shouldCoerceDateFieldNoiseToEmpty", () => {
    it("detects symbol-only debris without digits", () => {
      expect(shouldCoerceDateFieldNoiseToEmpty("$")).toBe(true);
      expect(shouldCoerceDateFieldNoiseToEmpty("—")).toBe(true);
      expect(shouldCoerceDateFieldNoiseToEmpty("n/a")).toBe(true);
    });

    it("rejects real dates and month words", () => {
      expect(shouldCoerceDateFieldNoiseToEmpty("30/03/2016")).toBe(false);
      expect(shouldCoerceDateFieldNoiseToEmpty("2016-Mar-30")).toBe(false);
      expect(shouldCoerceDateFieldNoiseToEmpty("March")).toBe(false);
    });
  });
});
