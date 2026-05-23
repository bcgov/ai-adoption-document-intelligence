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
import { formatCaseLabel, formatConditionLabel } from "./edge-labels";

describe("formatConditionLabel — Scenario 1: simple comparison", () => {
  it("renders ref vs literal boolean as `<left> <op> <right>`", () => {
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.requiresReview" },
      right: { literal: true },
    };
    expect(formatConditionLabel(expression)).toBe("ctx.requiresReview == true");
  });

  it("renders string literal with quotes via JSON.stringify", () => {
    const expression: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.status" },
      right: { literal: "approved" },
    };
    expect(formatConditionLabel(expression)).toBe('ctx.status == "approved"');
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
    expect(formatConditionLabel(expression)).toBe("ctx.field == null");
  });
});

describe("formatConditionLabel — Scenario 2: operator vocabulary", () => {
  const cases: ReadonlyArray<
    readonly [ComparisonExpression["operator"], string]
  > = [
    ["equals", "=="],
    ["not-equals", "!="],
    ["gt", ">"],
    ["gte", ">="],
    ["lt", "<"],
    ["lte", "<="],
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
  it("renders LogicalExpression `and` with 3 operands as `and (3)`", () => {
    const inner: ComparisonExpression = {
      operator: "equals",
      left: { ref: "a" },
      right: { literal: 1 },
    };
    const expression: LogicalExpression = {
      operator: "and",
      operands: [inner, inner, inner],
    };
    expect(formatConditionLabel(expression)).toBe("and (3)");
  });

  it("renders LogicalExpression `or` with 2 operands as `or (2)`", () => {
    const inner: ComparisonExpression = {
      operator: "equals",
      left: { ref: "a" },
      right: { literal: 1 },
    };
    const expression: LogicalExpression = {
      operator: "or",
      operands: [inner, inner],
    };
    expect(formatConditionLabel(expression)).toBe("or (2)");
  });

  it("renders NotExpression as `not (<inner-label>)`", () => {
    const inner: ComparisonExpression = {
      operator: "equals",
      left: { ref: "x" },
      right: { literal: true },
    };
    const expression: NotExpression = { operator: "not", operand: inner };
    expect(formatConditionLabel(expression)).toBe("not (x == true)");
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

  it("renders ListMembershipExpression `in` as `<ref> in [N items]`", () => {
    const expression: ListMembershipExpression = {
      operator: "in",
      value: { ref: "ctx.status" },
      list: { literal: ["a", "b", "c"] },
    };
    expect(formatConditionLabel(expression)).toBe("ctx.status in [3 items]");
  });

  it("renders ListMembershipExpression `not-in` as `<ref> not in [N items]`", () => {
    const expression: ListMembershipExpression = {
      operator: "not-in",
      value: { ref: "ctx.status" },
      list: { literal: ["a", "b"] },
    };
    expect(formatConditionLabel(expression)).toBe(
      "ctx.status not in [2 items]",
    );
  });

  it("falls back to `[? items]` when the list is a ref (size unknown)", () => {
    const expression: ListMembershipExpression = {
      operator: "in",
      value: { ref: "ctx.status" },
      list: { ref: "ctx.allowedStatuses" },
    };
    expect(formatConditionLabel(expression)).toBe(
      "ctx.status in ctx.allowedStatuses",
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
    expect(result).toBe("a == 1");
    expect(result.endsWith("…")).toBe(false);
  });
});

describe("formatCaseLabel — Scenario 5: case label composition", () => {
  it("renders `case[i]: <label>` for a case index + expression", () => {
    const expression: ConditionExpression = {
      operator: "equals",
      left: { ref: "ctx.requiresReview" },
      right: { literal: true },
    };
    expect(formatCaseLabel({ caseIndex: 2, expression })).toBe(
      "case[2]: ctx.requiresReview == true",
    );
  });

  it("renders `default` for the default kind", () => {
    expect(formatCaseLabel({ kind: "default" })).toBe("default");
  });

  it("renders `on error` for the error kind", () => {
    expect(formatCaseLabel({ kind: "error" })).toBe("on error");
  });
});
