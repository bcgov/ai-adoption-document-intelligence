/**
 * Tests for the `edge-labels` helpers used by the custom xyflow
 * `WorkflowEdge` component to render compact one-line labels for
 * switch case-routed edges. Each test maps to one acceptance scenario
 * from feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/
 * user_stories/US-021-edge-label-helper.md.
 */

import { describe, expect, it } from "vitest";
import type {
  ComparisonExpression,
  ConditionExpression,
  ListMembershipExpression,
  LogicalExpression,
  NotExpression,
  NullCheckExpression,
} from "../../../types/workflow";
import {
  formatCaseLabel,
  formatConditionExpanded,
  formatConditionLabel,
} from "./edge-labels";

describe("formatConditionLabel — Scenario 1: simple comparison", () => {
  it("renders ref vs literal boolean as `<left> <op> <right>`", () => {
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.requiresReview" },
      right: { literal: true },
    };
    expect(formatConditionLabel(expression)).toBe("ctx.requiresReview is true");
  });

  it("renders string literal with quotes via JSON.stringify", () => {
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.status" },
      right: { literal: "approved" },
    };
    expect(formatConditionLabel(expression)).toBe('ctx.status is "approved"');
  });

  it("renders numeric literal bare", () => {
    const expression: ComparisonExpression = {
      operator: "gt",
      left: { ref: "ctx.count" },
      right: { literal: 5 },
    };
    expect(formatConditionLabel(expression)).toBe("ctx.count > 5");
  });

  it("renders null literal as `null`", () => {
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.field" },
      right: { literal: null },
    };
    expect(formatConditionLabel(expression)).toBe("ctx.field is null");
  });
});

describe("formatConditionLabel — Scenario 2: operator vocabulary", () => {
  const cases: ReadonlyArray<
    readonly [ComparisonExpression["operator"], string]
  > = [
    ["equals", "is"],
    ["not-equals", "is not"],
    ["gt", ">"],
    ["gte", "≥"],
    ["lt", "<"],
    ["lte", "≤"],
    ["contains", "contains"],
  ];

  it.each(cases)("maps %p to %p", (operator, glyph) => {
    const expression: ComparisonExpression = {
      operator,
      left: { ref: "a" },
      right: { ref: "b" },
    };
    expect(formatConditionLabel(expression)).toBe(`a ${glyph} b`);
  });
});

describe("formatConditionLabel — Scenario 3: non-comparison fallbacks", () => {
  it("renders LogicalExpression `and` with 3 operands as `all of (3)`", () => {
    const inner: ComparisonExpression = {
      operator: "equals",
      left: { ref: "a" },
      right: { literal: 1 },
    };
    const expression: LogicalExpression = {
      operator: "and",
      operands: [inner, inner, inner],
    };
    expect(formatConditionLabel(expression)).toBe("all of (3)");
  });

  it("renders LogicalExpression `or` with 2 operands as `any of (2)`", () => {
    const inner: ComparisonExpression = {
      operator: "equals",
      left: { ref: "a" },
      right: { literal: 1 },
    };
    const expression: LogicalExpression = {
      operator: "or",
      operands: [inner, inner],
    };
    expect(formatConditionLabel(expression)).toBe("any of (2)");
  });

  it("renders NotExpression as `not (<inner-label>)`", () => {
    const inner: ComparisonExpression = {
      operator: "equals",
      left: { ref: "x" },
      right: { literal: true },
    };
    const expression: NotExpression = { operator: "not", operand: inner };
    expect(formatConditionLabel(expression)).toBe("not (x is true)");
  });

  it("renders NullCheckExpression `is-null` as `<ref> is null`", () => {
    const expression: NullCheckExpression = {
      operator: "is-null",
      value: { ref: "ctx.field" },
    };
    expect(formatConditionLabel(expression)).toBe("ctx.field is null");
  });

  it("renders NullCheckExpression `is-not-null` as `<ref> is not null`", () => {
    const expression: NullCheckExpression = {
      operator: "is-not-null",
      value: { ref: "ctx.field" },
    };
    expect(formatConditionLabel(expression)).toBe("ctx.field is not null");
  });

  it("renders ListMembershipExpression `in` as `<ref> is one of [N items]`", () => {
    const expression: ListMembershipExpression = {
      operator: "in",
      value: { ref: "ctx.status" },
      list: { literal: ["a", "b", "c"] },
    };
    expect(formatConditionLabel(expression)).toBe(
      "ctx.status is one of [3 items]",
    );
  });

  it("renders ListMembershipExpression `not-in` as `<ref> is not one of [N items]`", () => {
    const expression: ListMembershipExpression = {
      operator: "not-in",
      value: { ref: "ctx.status" },
      list: { literal: ["a", "b"] },
    };
    expect(formatConditionLabel(expression)).toBe(
      "ctx.status is not one of [2 items]",
    );
  });

  it("falls back to the raw list ref when the list is a ref (size unknown)", () => {
    const expression: ListMembershipExpression = {
      operator: "in",
      value: { ref: "ctx.status" },
      list: { ref: "ctx.allowedStatuses" },
    };
    expect(formatConditionLabel(expression)).toBe(
      "ctx.status is one of ctx.allowedStatuses",
    );
  });
});

describe("formatConditionLabel — Scenario 4: truncation", () => {
  it("truncates to exactly maxLength chars and ends with `…`", () => {
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.someReallyVeryLongFieldNameThatGoesOnAndOn" },
      right: { literal: "anotherLongStringValueHere" },
    };
    const result = formatConditionLabel(expression, { maxLength: 40 });
    expect(result.length).toBe(40);
    expect(result.endsWith("…")).toBe(true);
  });

  it("uses default maxLength of 60 when not provided", () => {
    const longRef = "ctx." + "a".repeat(200);
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: longRef },
      right: { literal: 1 },
    };
    const result = formatConditionLabel(expression);
    expect(result.length).toBe(60);
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate when rendered output fits within maxLength", () => {
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: "a" },
      right: { literal: 1 },
    };
    const result = formatConditionLabel(expression, { maxLength: 40 });
    expect(result).toBe("a is 1");
    expect(result.endsWith("…")).toBe(false);
  });
});

describe("formatCaseLabel — Scenario 5: case label composition", () => {
  it("renders `if <label>` for a case index + expression", () => {
    const expression: ConditionExpression = {
      operator: "equals",
      left: { ref: "ctx.requiresReview" },
      right: { literal: true },
    };
    expect(formatCaseLabel({ caseIndex: 2, expression })).toBe(
      "if ctx.requiresReview is true",
    );
  });

  it("renders `otherwise` for the default kind", () => {
    expect(formatCaseLabel({ kind: "default" })).toBe("otherwise");
  });

  it("renders `on error` for the error kind", () => {
    expect(formatCaseLabel({ kind: "error" })).toBe("on error");
  });
});

describe("formatConditionExpanded — spells nested logical groups out", () => {
  it("renders a bare comparison the same as the compact form", () => {
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: "a" },
      right: { literal: 1 },
    };
    expect(formatConditionExpanded(expression)).toBe("a is 1");
  });

  it("joins `and` operands with ` and `", () => {
    const expression: LogicalExpression = {
      operator: "and",
      operands: [
        { operator: "equals", left: { ref: "a" }, right: { literal: 1 } },
        { operator: "equals", left: { ref: "b" }, right: { literal: 2 } },
      ],
    };
    expect(formatConditionExpanded(expression)).toBe("a is 1 and b is 2");
  });

  it("joins `or` operands with ` or `", () => {
    const expression: LogicalExpression = {
      operator: "or",
      operands: [
        { operator: "gt", left: { ref: "a" }, right: { literal: 1 } },
        { operator: "lt", left: { ref: "b" }, right: { literal: 2 } },
      ],
    };
    expect(formatConditionExpanded(expression)).toBe("a > 1 or b < 2");
  });

  it("parenthesises nested and/or groups but not `not`", () => {
    // The demo's case[1]: AND( OR( EQ, GTE ), NOT( IS-NULL ) ).
    const expression: LogicalExpression = {
      operator: "and",
      operands: [
        {
          operator: "or",
          operands: [
            {
              operator: "equals",
              left: { ref: "ctx.currentDoc.type" },
              right: { literal: "receipt" },
            },
            {
              operator: "gte",
              left: { ref: "ctx.currentDoc.confidence" },
              right: { literal: 0.8 },
            },
          ],
        },
        {
          operator: "not",
          operand: {
            operator: "is-null",
            value: { ref: "ctx.currentDoc.blobKey" },
          },
        },
      ],
    };
    expect(formatConditionExpanded(expression)).toBe(
      '(ctx.currentDoc.type is "receipt" or ctx.currentDoc.confidence ≥ 0.8) and not (ctx.currentDoc.blobKey is null)',
    );
  });
});
