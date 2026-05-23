/**
 * Pure helpers for rendering compact one-line labels for switch
 * case-routed edges in the workflow canvas.
 *
 * `formatConditionLabel` renders a `ConditionExpression` (the
 * discriminated union from `@ai-di/graph-workflow`) into a short
 * human-readable string. `formatCaseLabel` composes that into the
 * `case[i]: <label>` / `default` / `on error` strings that the custom
 * `WorkflowEdge` component renders.
 *
 * See feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/
 * user_stories/US-021-edge-label-helper.md for the acceptance scenarios.
 */

import type {
  ComparisonExpression,
  ConditionExpression,
  ListMembershipExpression,
  LogicalExpression,
  NotExpression,
  NullCheckExpression,
  ValueRef,
} from "../../../types/workflow";

export interface FormatConditionLabelOptions {
  /** Maximum character length of the rendered output. Defaults to 60. */
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 60;
const ELLIPSIS = "…";

const COMPARISON_GLYPHS: Record<ComparisonExpression["operator"], string> = {
  equals: "==",
  "not-equals": "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  contains: "contains",
};

/**
 * Renders a `ValueRef` to its compact form: refs are emitted raw
 * (e.g. `ctx.field`), literals are JSON-stringified so strings keep
 * their quotes, booleans/numbers stay bare, and `null` becomes `null`.
 */
function formatValueRef(value: ValueRef): string {
  if ("ref" in value && typeof value.ref === "string") {
    return value.ref;
  }
  return JSON.stringify(value.literal);
}

function formatComparison(expression: ComparisonExpression): string {
  const glyph = COMPARISON_GLYPHS[expression.operator];
  return `${formatValueRef(expression.left)} ${glyph} ${formatValueRef(expression.right)}`;
}

function formatLogical(expression: LogicalExpression): string {
  return `${expression.operator} (${expression.operands.length})`;
}

function formatNot(expression: NotExpression): string {
  return `not (${formatConditionLabelRaw(expression.operand)})`;
}

function formatNullCheck(expression: NullCheckExpression): string {
  const suffix = expression.operator === "is-null" ? "is null" : "is not null";
  return `${formatValueRef(expression.value)} ${suffix}`;
}

function formatListMembership(expression: ListMembershipExpression): string {
  const verb = expression.operator === "in" ? "in" : "not in";
  const list = expression.list;
  const listLabel =
    "literal" in list && Array.isArray(list.literal)
      ? `[${list.literal.length} items]`
      : formatValueRef(list);
  return `${formatValueRef(expression.value)} ${verb} ${listLabel}`;
}

/**
 * Internal dispatcher — does not apply truncation so that nested calls
 * (e.g. `not (...)`) compose without intermediate ellipsis.
 */
function formatConditionLabelRaw(expression: ConditionExpression): string {
  switch (expression.operator) {
    case "equals":
    case "not-equals":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "contains":
      return formatComparison(expression);
    case "and":
    case "or":
      return formatLogical(expression);
    case "not":
      return formatNot(expression);
    case "is-null":
    case "is-not-null":
      return formatNullCheck(expression);
    case "in":
    case "not-in":
      return formatListMembership(expression);
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 0) {
    return "";
  }
  return value.slice(0, maxLength - ELLIPSIS.length) + ELLIPSIS;
}

/**
 * Renders a `ConditionExpression` as a compact one-line label. Long
 * outputs are truncated with a trailing ellipsis so the returned
 * string never exceeds `options.maxLength` characters (default 60).
 */
export function formatConditionLabel(
  expression: ConditionExpression,
  options?: FormatConditionLabelOptions,
): string {
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  return truncate(formatConditionLabelRaw(expression), maxLength);
}

export type CaseLabelInput =
  | { caseIndex: number; expression: ConditionExpression }
  | { kind: "default" }
  | { kind: "error" };

/**
 * Composes the string rendered on a switch case-routed edge: either
 * `case[i]: <predicate>`, `default`, or `on error`.
 */
export function formatCaseLabel(input: CaseLabelInput): string {
  if ("kind" in input) {
    return input.kind === "default" ? "default" : "on error";
  }
  return `case[${input.caseIndex}]: ${formatConditionLabel(input.expression)}`;
}
