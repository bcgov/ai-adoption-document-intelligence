import { hitlApplyReviewCriteriaParametersSchema } from "./hitl-apply-review-criteria";

const incomeRule = {
  name: "income-confidence-gate",
  select: {
    fieldPatterns: ["applicant_*"],
    excludeFieldPatterns: ["*_name"],
    fieldTypes: ["number"],
  },
  when: [{ confidenceBelow: 0.96 }],
  skipWhen: [{ predictionIsBlank: true }, { predictionLengthAtMost: 1 }],
  action: "review",
  reason: "low-confidence income value",
};

describe("hitl.applyReviewCriteria parameters", () => {
  it("accepts rules using every condition", () => {
    const result = hitlApplyReviewCriteriaParametersSchema.safeParse({
      documentType: "template-1",
      defaultAction: "skip",
      inferredFieldKeys: ["total"],
      ruleConfidenceOverrides: { "income-confidence-gate": 0.9 },
      rules: [
        incomeRule,
        {
          name: "everything-else",
          select: { fields: ["sin", "total"] },
          when: [
            { formatValidationFails: true },
            { valueOutsideRange: { min: 0, max: 100 } },
            { valueWasInferred: true },
            { always: true },
          ],
          action: "skip",
          reason: "covered",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("refuses a condition the step does not know", () => {
    const result = hitlApplyReviewCriteriaParametersSchema.safeParse({
      rules: [{ ...incomeRule, when: [{ confidenceAbove: 0.5 }] }],
    });
    expect(result.success).toBe(false);
  });

  it("refuses a rule without an action", () => {
    const { action: _action, ...withoutAction } = incomeRule;
    const result = hitlApplyReviewCriteriaParametersSchema.safeParse({
      rules: [withoutAction],
    });
    expect(result.success).toBe(false);
  });

  it("refuses an empty rule list", () => {
    expect(
      hitlApplyReviewCriteriaParametersSchema.safeParse({ rules: [] }).success,
    ).toBe(false);
  });

  it("requires the rules", () => {
    expect(hitlApplyReviewCriteriaParametersSchema.safeParse({}).success).toBe(
      false,
    );
  });
});
