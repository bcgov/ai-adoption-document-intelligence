import {
  applyExperimentFieldFilter,
  classifyFieldCategory,
} from "./experiment-field-filter";

describe("experiment-field-filter", () => {
  describe("classifyFieldCategory", () => {
    it("classifies known categories", () => {
      expect(classifyFieldCategory("sin")).toBe("sin");
      expect(classifyFieldCategory("spouse_sin")).toBe("sin");
      expect(classifyFieldCategory("date")).toBe("date");
      expect(classifyFieldCategory("spouse_date")).toBe("date");
      expect(classifyFieldCategory("phone")).toBe("phone");
      expect(classifyFieldCategory("name")).toBe("name");
      expect(classifyFieldCategory("signature")).toBe("signature");
      expect(classifyFieldCategory("explain_changes")).toBe("freeform_text");
      expect(classifyFieldCategory("case_id")).toBe("case_id");
      expect(classifyFieldCategory("checkbox_warrant_no")).toBe("checkboxes");
    });

    it("defaults income for unknown fields (mirrors planner)", () => {
      expect(classifyFieldCategory("applicant_employment_income")).toBe(
        "income_amounts",
      );
      expect(classifyFieldCategory("spouse_other_income")).toBe(
        "income_amounts",
      );
    });
  });

  describe("applyExperimentFieldFilter", () => {
    const fields = {
      sin: { valueString: "123456789", confidence: 0.95 },
      spouse_sin: { valueString: "", confidence: 0.99 }, // blank
      phone: { valueString: "604-555-0100", confidence: 0.8 },
      signature: { valueString: "signed", confidence: 0.5 }, // not in filter
      applicant_employment_income: { valueString: "1500", confidence: 0.9 },
      spouse_other_income: { valueString: "X", confidence: 0.7 }, // trivial (single char)
      applicant_workers_compensation: { valueString: "", confidence: 0.99 }, // blank
    };

    it("returns input unchanged when env is empty", () => {
      const out = applyExperimentFieldFilter(fields, undefined);
      expect(Object.keys(out as Record<string, unknown>).sort()).toEqual(
        Object.keys(fields).sort(),
      );
    });

    it("returns empty when env set but fields null", () => {
      const out = applyExperimentFieldFilter(null, "sin,phone");
      expect(out).toEqual({});
    });

    it("keeps only allowed categories with non-empty predictions", () => {
      const out = applyExperimentFieldFilter(
        fields,
        "sin,phone,income_amounts",
      ) as Record<string, unknown>;
      expect(Object.keys(out).sort()).toEqual(
        ["applicant_employment_income", "phone", "sin"].sort(),
      );
    });

    it("excludes trivial income predictions (single char)", () => {
      const out = applyExperimentFieldFilter(
        fields,
        "income_amounts",
      ) as Record<string, unknown>;
      // applicant_employment_income kept; spouse_other_income (single char) dropped
      expect(Object.keys(out)).toEqual(["applicant_employment_income"]);
    });

    it("does NOT exclude single-char predictions for non-income categories", () => {
      const singleCharFields = {
        sin: { valueString: "X", confidence: 0.5 },
        phone: { valueString: "1", confidence: 0.5 },
      };
      const out = applyExperimentFieldFilter(
        singleCharFields,
        "sin,phone",
      ) as Record<string, unknown>;
      expect(Object.keys(out).sort()).toEqual(["phone", "sin"]);
    });

    describe("allow-list mode (exact match to reviewable-items.csv)", () => {
      it("keeps only fields whose name is in the allow-list", () => {
        const allowlist = new Set(["sin", "applicant_employment_income"]);
        const out = applyExperimentFieldFilter(
          fields,
          "sin,phone,name,date,income_amounts",
          allowlist,
        ) as Record<string, unknown>;
        expect(Object.keys(out).sort()).toEqual(
          ["applicant_employment_income", "sin"].sort(),
        );
      });

      it("keeps allow-listed fields even when prediction is empty (missing-class)", () => {
        // Mirrors the missing-class items in reviewable-items.csv: OCR
        // returned nothing, but the form has content so the reviewer
        // still needs to see the field.
        const allowlist = new Set(["applicant_workers_compensation"]);
        const out = applyExperimentFieldFilter(
          fields,
          "income_amounts",
          allowlist,
        ) as Record<string, unknown>;
        // applicant_workers_compensation has valueString:"" but is in allowlist
        expect(Object.keys(out)).toEqual(["applicant_workers_compensation"]);
      });

      it("keeps allow-listed fields even when prediction is trivial (income)", () => {
        // If the offline analysis decided a trivial-predicted cell IS
        // reviewable (e.g. because GT is non-empty), surfacing it for
        // review is correct. The allow-list is authoritative.
        const allowlist = new Set(["spouse_other_income"]);
        const out = applyExperimentFieldFilter(
          fields,
          "income_amounts",
          allowlist,
        ) as Record<string, unknown>;
        expect(Object.keys(out)).toEqual(["spouse_other_income"]);
      });

      it("ignores envValue category set when allow-list is supplied", () => {
        // Allow-list takes precedence; envValue is only the on/off switch.
        const allowlist = new Set(["signature"]);
        const out = applyExperimentFieldFilter(
          { signature: { valueString: "signed" } },
          "sin,phone,name,date,income_amounts", // signature not in env list
          allowlist,
        ) as Record<string, unknown>;
        expect(Object.keys(out)).toEqual(["signature"]);
      });

      it("returns empty when envValue is unset (filter still off)", () => {
        const allowlist = new Set(["sin"]);
        const out = applyExperimentFieldFilter(fields, undefined, allowlist);
        // envValue empty → passthrough wins (no filter applied)
        expect(Object.keys(out as Record<string, unknown>).sort()).toEqual(
          Object.keys(fields).sort(),
        );
      });
    });
  });
});
