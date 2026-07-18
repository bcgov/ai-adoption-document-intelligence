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

/**
 * Humanised comparison operators. Equality reads as "is" / "is not" and the
 * relational operators keep the compact unicode glyphs (`≥` / `≤`) so labels
 * stay short against the truncation budget. `contains` is already a word.
 */
const COMPARISON_WORDS: Record<ComparisonExpression["operator"], string> = {
  equals: "is",
  "not-equals": "is not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
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
  const word = COMPARISON_WORDS[expression.operator];
  return `${formatValueRef(expression.left)} ${word} ${formatValueRef(expression.right)}`;
}

/**
 * Compact (space-constrained) rendering of a logical group used on canvas
 * edges: `all of (2)` / `any of (3)` — the operands themselves are omitted so
 * the edge label stays short. The settings-panel preview uses
 * `formatConditionExpanded` instead, which spells the operands out in full.
 */
function formatLogical(expression: LogicalExpression): string {
  const verb = expression.operator === "and" ? "all of" : "any of";
  return `${verb} (${expression.operands.length})`;
}

function formatNot(expression: NotExpression): string {
  return `not (${formatConditionLabelRaw(expression.operand)})`;
}

function formatNullCheck(expression: NullCheckExpression): string {
  const suffix = expression.operator === "is-null" ? "is null" : "is not null";
  return `${formatValueRef(expression.value)} ${suffix}`;
}

function formatListMembership(expression: ListMembershipExpression): string {
  const verb = expression.operator === "in" ? "is one of" : "is not one of";
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
 * Composes the string rendered on a switch case-routed edge: `if <predicate>`
 * for a matched case, `otherwise` for the default edge, or `on error`.
 */
export function formatCaseLabel(input: CaseLabelInput): string {
  if ("kind" in input) {
    return input.kind === "default" ? "otherwise" : "on error";
  }
  return `if ${formatConditionLabel(input.expression)}`;
}

/**
 * True for the infix logical groups (`and` / `or`) that need parentheses when
 * nested inside another group. `not` is excluded — it already renders with its
 * own `not (...)` parentheses, so wrapping it again would double up.
 */
function needsGrouping(expression: ConditionExpression): boolean {
  return expression.operator === "and" || expression.operator === "or";
}

/**
 * Fully-expanded, un-truncated rendering of a condition tree — spells logical
 * groups out (`a is "receipt" or b ≥ 0.8`) instead of collapsing them to
 * `any of (2)`. Compound operands are parenthesised so grouping is preserved.
 *
 * Used by the condition editor's live preview (where space is not constrained)
 * so an author can read the whole boolean logic as a sentence while building
 * deeply-nested cases. Leaf rendering (comparisons, refs/literals, null checks,
 * membership) is shared with the compact edge-label path.
 */
export function formatConditionExpanded(
  expression: ConditionExpression,
): string {
  switch (expression.operator) {
    case "and":
    case "or": {
      const joiner = expression.operator === "and" ? " and " : " or ";
      return expression.operands
        .map((operand) => {
          const inner = formatConditionExpanded(operand);
          return needsGrouping(operand) ? `(${inner})` : inner;
        })
        .join(joiner);
    }
    case "not": {
      const inner = formatConditionExpanded(expression.operand);
      return `not (${inner})`;
    }
    default:
      // Comparison / null-check / membership leaves reuse the compact path —
      // those never collapse, so their output is already fully expanded.
      return formatConditionLabelRaw(expression);
  }
}
