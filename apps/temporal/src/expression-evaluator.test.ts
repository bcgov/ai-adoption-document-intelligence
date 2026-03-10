import { evaluateCondition, resolveValueRef } from "./expression-evaluator";
import type {
  ComparisonExpression,
  ConditionExpression,
  ListMembershipExpression,
  LogicalExpression,
  NotExpression,
  NullCheckExpression,
} from "./graph-workflow-types";

describe("expression-evaluator", () => {
  // -----------------------------------------------------------------------
  // Scenario 1: Comparison expressions
  // -----------------------------------------------------------------------
  describe("comparison expressions", () => {
    it("equals returns true for strict equality", () => {
      const expr: ComparisonExpression = {
        operator: "equals",
        left: { ref: "ctx.status" },
        right: { literal: "succeeded" },
      };
      expect(evaluateCondition(expr, { status: "succeeded" })).toBe(true);
    });

    it("equals returns false for different values", () => {
      const expr: ComparisonExpression = {
        operator: "equals",
        left: { ref: "ctx.status" },
        right: { literal: "failed" },
      };
      expect(evaluateCondition(expr, { status: "succeeded" })).toBe(false);
    });

    it("equals uses strict equality - no type coercion", () => {
      const expr: ComparisonExpression = {
        operator: "equals",
        left: { ref: "ctx.count" },
        right: { literal: "5" },
      };
      expect(evaluateCondition(expr, { count: 5 })).toBe(false);
    });

    it("not-equals returns true for different values", () => {
      const expr: ComparisonExpression = {
        operator: "not-equals",
        left: { ref: "ctx.ocrResponse.status" },
        right: { literal: "running" },
      };
      expect(
        evaluateCondition(expr, { ocrResponse: { status: "succeeded" } }),
      ).toBe(true);
    });

    it("not-equals returns false for same values", () => {
      const expr: ComparisonExpression = {
        operator: "not-equals",
        left: { ref: "ctx.status" },
        right: { literal: "running" },
      };
      expect(evaluateCondition(expr, { status: "running" })).toBe(false);
    });

    it("gt returns true when left > right", () => {
      const expr: ComparisonExpression = {
        operator: "gt",
        left: { ref: "ctx.confidence" },
        right: { literal: 0.9 },
      };
      expect(evaluateCondition(expr, { confidence: 0.95 })).toBe(true);
    });

    it("gt returns false when left <= right", () => {
      const expr: ComparisonExpression = {
        operator: "gt",
        left: { ref: "ctx.confidence" },
        right: { literal: 0.95 },
      };
      expect(evaluateCondition(expr, { confidence: 0.95 })).toBe(false);
    });

    it("gt returns false for non-number types", () => {
      const expr: ComparisonExpression = {
        operator: "gt",
        left: { ref: "ctx.name" },
        right: { literal: 5 },
      };
      expect(evaluateCondition(expr, { name: "abc" })).toBe(false);
    });

    it("gte returns true when left >= right", () => {
      const expr: ComparisonExpression = {
        operator: "gte",
        left: { ref: "ctx.count" },
        right: { literal: 10 },
      };
      expect(evaluateCondition(expr, { count: 10 })).toBe(true);
      expect(evaluateCondition(expr, { count: 11 })).toBe(true);
    });

    it("lt returns true when left < right", () => {
      const expr: ComparisonExpression = {
        operator: "lt",
        left: { ref: "ctx.confidence" },
        right: { literal: 0.95 },
      };
      expect(evaluateCondition(expr, { confidence: 0.8 })).toBe(true);
    });

    it("lte returns true when left <= right", () => {
      const expr: ComparisonExpression = {
        operator: "lte",
        left: { ref: "ctx.count" },
        right: { literal: 5 },
      };
      expect(evaluateCondition(expr, { count: 5 })).toBe(true);
      expect(evaluateCondition(expr, { count: 4 })).toBe(true);
    });

    it("contains returns true when string contains substring (case-sensitive)", () => {
      const expr: ComparisonExpression = {
        operator: "contains",
        left: { ref: "ctx.text" },
        right: { literal: "Invoice" },
      };
      expect(
        evaluateCondition(expr, { text: "This is an Invoice document" }),
      ).toBe(true);
    });

    it("contains is case-sensitive", () => {
      const expr: ComparisonExpression = {
        operator: "contains",
        left: { ref: "ctx.text" },
        right: { literal: "invoice" },
      };
      expect(
        evaluateCondition(expr, { text: "This is an Invoice document" }),
      ).toBe(false);
    });

    it("contains returns false for non-string types", () => {
      const expr: ComparisonExpression = {
        operator: "contains",
        left: { ref: "ctx.count" },
        right: { literal: "5" },
      };
      expect(evaluateCondition(expr, { count: 5 })).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Logical expressions with short-circuit
  // -----------------------------------------------------------------------
  describe("logical expressions", () => {
    it("and returns true when all operands are true", () => {
      const expr: LogicalExpression = {
        operator: "and",
        operands: [
          { operator: "equals", left: { ref: "ctx.a" }, right: { literal: 1 } },
          { operator: "equals", left: { ref: "ctx.b" }, right: { literal: 2 } },
        ],
      };
      expect(evaluateCondition(expr, { a: 1, b: 2 })).toBe(true);
    });

    it("and returns false when any operand is false", () => {
      const expr: LogicalExpression = {
        operator: "and",
        operands: [
          { operator: "equals", left: { ref: "ctx.a" }, right: { literal: 1 } },
          {
            operator: "equals",
            left: { ref: "ctx.b" },
            right: { literal: 99 },
          },
        ],
      };
      expect(evaluateCondition(expr, { a: 1, b: 2 })).toBe(false);
    });

    it("and short-circuits on first false operand", () => {
      // The second operand would fail if evaluated (accessing .x on null)
      // but short-circuit means it's never reached
      const expr: LogicalExpression = {
        operator: "and",
        operands: [
          {
            operator: "equals",
            left: { ref: "ctx.a" },
            right: { literal: false },
          },
          {
            operator: "equals",
            left: { ref: "ctx.nonExistent.deep" },
            right: { literal: "x" },
          },
        ],
      };
      expect(evaluateCondition(expr, { a: false })).toBe(false);
    });

    it("and with empty operands returns true", () => {
      const expr: LogicalExpression = { operator: "and", operands: [] };
      expect(evaluateCondition(expr, {})).toBe(true);
    });

    it("or returns true when any operand is true", () => {
      const expr: LogicalExpression = {
        operator: "or",
        operands: [
          {
            operator: "equals",
            left: { ref: "ctx.a" },
            right: { literal: 99 },
          },
          { operator: "equals", left: { ref: "ctx.b" }, right: { literal: 2 } },
        ],
      };
      expect(evaluateCondition(expr, { a: 1, b: 2 })).toBe(true);
    });

    it("or returns false when all operands are false", () => {
      const expr: LogicalExpression = {
        operator: "or",
        operands: [
          {
            operator: "equals",
            left: { ref: "ctx.a" },
            right: { literal: 99 },
          },
          {
            operator: "equals",
            left: { ref: "ctx.b" },
            right: { literal: 99 },
          },
        ],
      };
      expect(evaluateCondition(expr, { a: 1, b: 2 })).toBe(false);
    });

    it("or short-circuits on first true operand", () => {
      const expr: LogicalExpression = {
        operator: "or",
        operands: [
          { operator: "equals", left: { ref: "ctx.a" }, right: { literal: 1 } },
          {
            operator: "equals",
            left: { ref: "ctx.nonExistent.deep" },
            right: { literal: "x" },
          },
        ],
      };
      expect(evaluateCondition(expr, { a: 1 })).toBe(true);
    });

    it("or with empty operands returns false", () => {
      const expr: LogicalExpression = { operator: "or", operands: [] };
      expect(evaluateCondition(expr, {})).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Not expressions
  // -----------------------------------------------------------------------
  describe("not expressions", () => {
    it("negates a true expression to false", () => {
      const expr: NotExpression = {
        operator: "not",
        operand: {
          operator: "equals",
          left: { ref: "ctx.a" },
          right: { literal: 1 },
        },
      };
      expect(evaluateCondition(expr, { a: 1 })).toBe(false);
    });

    it("negates a false expression to true", () => {
      const expr: NotExpression = {
        operator: "not",
        operand: {
          operator: "equals",
          left: { ref: "ctx.a" },
          right: { literal: 99 },
        },
      };
      expect(evaluateCondition(expr, { a: 1 })).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Null check expressions
  // -----------------------------------------------------------------------
  describe("null check expressions", () => {
    it("is-null returns true for null value", () => {
      const expr: NullCheckExpression = {
        operator: "is-null",
        value: { ref: "ctx.result" },
      };
      expect(evaluateCondition(expr, { result: null })).toBe(true);
    });

    it("is-null returns true for undefined value", () => {
      const expr: NullCheckExpression = {
        operator: "is-null",
        value: { ref: "ctx.result" },
      };
      expect(evaluateCondition(expr, {})).toBe(true);
    });

    it("is-null returns false for present value", () => {
      const expr: NullCheckExpression = {
        operator: "is-null",
        value: { ref: "ctx.result" },
      };
      expect(evaluateCondition(expr, { result: "data" })).toBe(false);
    });

    it("is-null returns false for zero", () => {
      const expr: NullCheckExpression = {
        operator: "is-null",
        value: { ref: "ctx.count" },
      };
      expect(evaluateCondition(expr, { count: 0 })).toBe(false);
    });

    it("is-null returns false for empty string", () => {
      const expr: NullCheckExpression = {
        operator: "is-null",
        value: { ref: "ctx.name" },
      };
      expect(evaluateCondition(expr, { name: "" })).toBe(false);
    });

    it("is-null returns false for false boolean", () => {
      const expr: NullCheckExpression = {
        operator: "is-null",
        value: { ref: "ctx.flag" },
      };
      expect(evaluateCondition(expr, { flag: false })).toBe(false);
    });

    it("is-not-null returns true for present value", () => {
      const expr: NullCheckExpression = {
        operator: "is-not-null",
        value: { ref: "ctx.result" },
      };
      expect(evaluateCondition(expr, { result: "data" })).toBe(true);
    });

    it("is-not-null returns false for null", () => {
      const expr: NullCheckExpression = {
        operator: "is-not-null",
        value: { ref: "ctx.result" },
      };
      expect(evaluateCondition(expr, { result: null })).toBe(false);
    });

    it("is-not-null returns false for undefined", () => {
      const expr: NullCheckExpression = {
        operator: "is-not-null",
        value: { ref: "ctx.result" },
      };
      expect(evaluateCondition(expr, {})).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: List membership expressions
  // -----------------------------------------------------------------------
  describe("list membership expressions", () => {
    it("in returns true when value is in the list", () => {
      const expr: ListMembershipExpression = {
        operator: "in",
        value: { ref: "ctx.segmentType" },
        list: { literal: ["invoice", "receipt", "purchase-order"] },
      };
      expect(evaluateCondition(expr, { segmentType: "invoice" })).toBe(true);
    });

    it("in returns false when value is not in the list", () => {
      const expr: ListMembershipExpression = {
        operator: "in",
        value: { ref: "ctx.segmentType" },
        list: { literal: ["invoice", "receipt"] },
      };
      expect(evaluateCondition(expr, { segmentType: "report" })).toBe(false);
    });

    it("not-in returns true when value is not in the list", () => {
      const expr: ListMembershipExpression = {
        operator: "not-in",
        value: { ref: "ctx.segmentType" },
        list: { literal: ["invoice", "receipt"] },
      };
      expect(evaluateCondition(expr, { segmentType: "report" })).toBe(true);
    });

    it("not-in returns false when value is in the list", () => {
      const expr: ListMembershipExpression = {
        operator: "not-in",
        value: { ref: "ctx.segmentType" },
        list: { literal: ["invoice", "receipt"] },
      };
      expect(evaluateCondition(expr, { segmentType: "invoice" })).toBe(false);
    });

    it("returns false when list is not an array", () => {
      const expr: ListMembershipExpression = {
        operator: "in",
        value: { ref: "ctx.val" },
        list: { literal: "not-an-array" },
      };
      expect(evaluateCondition(expr, { val: "x" })).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Context variable references with dot notation
  // -----------------------------------------------------------------------
  describe("context variable resolution", () => {
    it("resolves simple ctx key", () => {
      expect(
        resolveValueRef({ ref: "ctx.documentId" }, { documentId: "doc-123" }),
      ).toBe("doc-123");
    });

    it("resolves nested ctx key", () => {
      expect(
        resolveValueRef(
          { ref: "ctx.currentSegment.blobKey" },
          {
            currentSegment: { blobKey: "blob-456" },
          },
        ),
      ).toBe("blob-456");
    });

    it("resolves deeply nested ctx key", () => {
      expect(
        resolveValueRef({ ref: "ctx.a.b.c" }, { a: { b: { c: "deep" } } }),
      ).toBe("deep");
    });

    it("returns null when intermediate property is null", () => {
      expect(resolveValueRef({ ref: "ctx.a.b.c" }, { a: null })).toBeNull();
    });

    it("returns null when intermediate property is undefined", () => {
      expect(resolveValueRef({ ref: "ctx.a.b.c" }, {})).toBeNull();
    });

    it("returns null when intermediate is not an object", () => {
      expect(resolveValueRef({ ref: "ctx.a.b.c" }, { a: 42 })).toBeNull();
    });

    it("resolves doc namespace alias", () => {
      expect(
        resolveValueRef(
          { ref: "doc.fileName" },
          {
            documentMetadata: { fileName: "test.pdf" },
          },
        ),
      ).toBe("test.pdf");
    });

    it("resolves segment namespace alias", () => {
      expect(
        resolveValueRef(
          { ref: "segment.blobKey" },
          {
            currentSegment: { blobKey: "seg-001" },
          },
        ),
      ).toBe("seg-001");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Literal values
  // -----------------------------------------------------------------------
  describe("literal values", () => {
    it("returns boolean literal", () => {
      expect(resolveValueRef({ literal: true }, {})).toBe(true);
    });

    it("returns number literal", () => {
      expect(resolveValueRef({ literal: 0.95 }, {})).toBe(0.95);
    });

    it("returns string literal", () => {
      expect(resolveValueRef({ literal: "test" }, {})).toBe("test");
    });

    it("returns null literal", () => {
      expect(resolveValueRef({ literal: null }, {})).toBeNull();
    });

    it("returns array literal", () => {
      const arr = [1, 2, 3];
      expect(resolveValueRef({ literal: arr }, {})).toEqual(arr);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 8: Nested / complex expressions
  // -----------------------------------------------------------------------
  describe("nested expressions", () => {
    it("evaluates confidence threshold with AND (spec Section 14.4 example)", () => {
      const expr: ConditionExpression = {
        operator: "and",
        operands: [
          {
            operator: "lt",
            left: { ref: "ctx.averageConfidence" },
            right: { literal: 0.95 },
          },
          {
            operator: "is-not-null",
            value: { ref: "ctx.averageConfidence" },
          },
        ],
      };

      expect(evaluateCondition(expr, { averageConfidence: 0.8 })).toBe(true);
      expect(evaluateCondition(expr, { averageConfidence: 0.99 })).toBe(false);
      expect(evaluateCondition(expr, {})).toBe(false);
    });

    it("evaluates document type classification routing (spec Section 14.4 example)", () => {
      const expr: ConditionExpression = {
        operator: "in",
        value: { ref: "ctx.segmentType" },
        list: { literal: ["invoice", "receipt", "purchase-order"] },
      };

      expect(evaluateCondition(expr, { segmentType: "invoice" })).toBe(true);
      expect(evaluateCondition(expr, { segmentType: "unknown" })).toBe(false);
    });

    it("evaluates complex nested condition", () => {
      // (status == "succeeded" AND confidence >= 0.9) OR requiresReview == false
      const expr: ConditionExpression = {
        operator: "or",
        operands: [
          {
            operator: "and",
            operands: [
              {
                operator: "equals",
                left: { ref: "ctx.status" },
                right: { literal: "succeeded" },
              },
              {
                operator: "gte",
                left: { ref: "ctx.confidence" },
                right: { literal: 0.9 },
              },
            ],
          },
          {
            operator: "equals",
            left: { ref: "ctx.requiresReview" },
            right: { literal: false },
          },
        ],
      };

      // Both conditions true in the AND
      expect(
        evaluateCondition(expr, {
          status: "succeeded",
          confidence: 0.95,
          requiresReview: true,
        }),
      ).toBe(true);

      // AND fails, but OR second branch is true
      expect(
        evaluateCondition(expr, {
          status: "failed",
          confidence: 0.5,
          requiresReview: false,
        }),
      ).toBe(true);

      // Both branches false
      expect(
        evaluateCondition(expr, {
          status: "failed",
          confidence: 0.5,
          requiresReview: true,
        }),
      ).toBe(false);
    });

    it("evaluates NOT with nested AND", () => {
      const expr: ConditionExpression = {
        operator: "not",
        operand: {
          operator: "and",
          operands: [
            {
              operator: "equals",
              left: { ref: "ctx.a" },
              right: { literal: 1 },
            },
            {
              operator: "equals",
              left: { ref: "ctx.b" },
              right: { literal: 2 },
            },
          ],
        },
      };

      expect(evaluateCondition(expr, { a: 1, b: 2 })).toBe(false);
      expect(evaluateCondition(expr, { a: 1, b: 3 })).toBe(true);
    });
  });
});
