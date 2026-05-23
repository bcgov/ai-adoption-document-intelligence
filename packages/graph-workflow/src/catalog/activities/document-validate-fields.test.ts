import {
  documentValidateFieldsCatalogEntry,
  documentValidateFieldsParametersSchema,
} from "./document-validate-fields";

describe("document.validateFields catalog entry", () => {
  it("has the expected activity type", () => {
    expect(documentValidateFieldsCatalogEntry.activityType).toBe(
      "document.validateFields",
    );
  });

  it("declares processedSegments + documentId as required inputs", () => {
    const required = documentValidateFieldsCatalogEntry.inputs
      .filter((i) => i.required)
      .map((i) => i.name)
      .sort();
    expect(required).toEqual(["documentId", "processedSegments"]);
  });

  describe("parameter validation", () => {
    // Mirrors the actual rule the multi-page-report-workflow template
    // ships with — see docs-md/graph-workflows/templates/multi-page-report-workflow.json.
    // This is the canonical shape the runtime activity consumes
    // (apps/temporal/src/activities/document-validate-fields.ts → ValidationRule).
    it("accepts the template's arithmetic rule with a nested expression", () => {
      const result = documentValidateFieldsParametersSchema.safeParse({
        rules: [
          {
            name: "pay-stub-arithmetic",
            type: "arithmetic",
            expression: {
              operation: "difference",
              fields: ["page2.grossPay", "page2.totalDeductions"],
              equals: "page2.netPay",
            },
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects the legacy flat arithmetic shape (operation/fields/equals at top level)", () => {
      // Catches regressions where someone re-flattens the schema.
      const result = documentValidateFieldsParametersSchema.safeParse({
        rules: [
          {
            name: "pay-stub-arithmetic",
            type: "arithmetic",
            operation: "difference",
            fields: ["a", "b"],
            equals: "c",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("accepts the template's field-match rule", () => {
      const result = documentValidateFieldsParametersSchema.safeParse({
        rules: [
          {
            name: "gross-pay-match",
            type: "field-match",
            primaryField: "page1.grossPay",
            attachmentField: "page2.grossPay",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts the template's array-match rule", () => {
      const result = documentValidateFieldsParametersSchema.safeParse({
        rules: [
          {
            name: "deposits-match",
            type: "array-match",
            primaryFields: ["page1.netPay", "page1.totalOtherIncome"],
            attachmentFields: ["page3.amount"],
            matchType: "all",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects operator='exact' (runtime activity uses 'equals')", () => {
      // The runtime activity's `ValidationRule.operator` is
      // `"equals" | "approximately"` (see
      // apps/temporal/src/activities/document-validate-fields.ts L22);
      // catalog vocabulary must stay aligned so editor-authored rules
      // are consumable without translation.
      const result = documentValidateFieldsParametersSchema.safeParse({
        rules: [
          {
            name: "x",
            type: "field-match",
            primaryField: "a",
            attachmentField: "b",
            operator: "exact",
            fieldType: "text",
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("accepts the full set of rules from multi-page-report-workflow.json end-to-end", () => {
      // This is the exact `parameters` block from the template — the
      // canonical "the editor must accept and round-trip this without
      // flagging any validation issues" assertion.
      const result = documentValidateFieldsParametersSchema.safeParse({
        rules: [
          {
            name: "pay-stub-arithmetic",
            type: "arithmetic",
            expression: {
              operation: "difference",
              fields: ["page2.grossPay", "page2.totalDeductions"],
              equals: "page2.netPay",
            },
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
          {
            name: "gross-pay-match",
            type: "field-match",
            primaryField: "page1.grossPay",
            attachmentField: "page2.grossPay",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
          {
            name: "net-pay-match",
            type: "field-match",
            primaryField: "page1.netPay",
            attachmentField: "page2.netPay",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
          {
            name: "deposits-match",
            type: "array-match",
            primaryFields: ["page1.netPay", "page1.totalOtherIncome"],
            attachmentFields: ["page3.amount"],
            matchType: "all",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });
});
