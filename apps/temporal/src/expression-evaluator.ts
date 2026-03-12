/**
 * Structured Operator DSL Expression Evaluator
 *
 * Evaluates condition expressions against the workflow context.
 * Used by switch nodes and pollUntil nodes for branching decisions.
 *
 * Key semantics:
 * - No implicit type coercion (strict equality)
 * - null and undefined are treated as equivalent ("missing")
 * - String contains is case-sensitive
 * - Short-circuit evaluation for and/or
 * - Dot notation for nested property access; null intermediates yield null
 */

import type {
  ComparisonExpression,
  ConditionExpression,
  ListMembershipExpression,
  LogicalExpression,
  NotExpression,
  NullCheckExpression,
  ValueRef,
} from "./graph-workflow-types";

/**
 * Evaluate a condition expression against a workflow context.
 */
export function evaluateCondition(
  expression: ConditionExpression,
  ctx: Record<string, unknown>,
): boolean {
  switch (expression.operator) {
    // Comparison operators
    case "equals":
    case "not-equals":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "contains":
      return evaluateComparison(expression as ComparisonExpression, ctx);

    // Logical operators
    case "and":
    case "or":
      return evaluateLogical(expression as LogicalExpression, ctx);

    // Not operator
    case "not":
      return evaluateNot(expression as NotExpression, ctx);

    // Null check operators
    case "is-null":
    case "is-not-null":
      return evaluateNullCheck(expression as NullCheckExpression, ctx);

    // List membership operators
    case "in":
    case "not-in":
      return evaluateListMembership(
        expression as ListMembershipExpression,
        ctx,
      );

    default: {
      const exhaustiveCheck: never = expression;
      throw new Error(
        `Unknown expression operator: ${(exhaustiveCheck as ConditionExpression).operator}`,
      );
    }
  }
}

/**
 * Resolve a ValueRef to its actual value from context or as a literal.
 */
export function resolveValueRef(
  ref: ValueRef,
  ctx: Record<string, unknown>,
): unknown {
  if ("literal" in ref && ref.literal !== undefined) {
    return ref.literal;
  }

  if ("ref" in ref && ref.ref !== undefined) {
    return resolveReference(ref.ref, ctx);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal: Reference Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a dotted reference string against the workflow context.
 *
 * Supported namespaces:
 * - ctx.<key>              -> ctx[key]
 * - ctx.<key>.<nested>     -> ctx[key][nested]
 * - doc.<field>            -> ctx.documentMetadata[field]
 * - segment.<field>        -> ctx.currentSegment[field]
 */
function resolveReference(
  refString: string,
  ctx: Record<string, unknown>,
): unknown {
  const parts = refString.split(".");

  if (parts.length === 0) {
    return null;
  }

  const namespace = parts[0];
  let remainingParts: string[];

  switch (namespace) {
    case "ctx":
      remainingParts = parts.slice(1);
      return traversePath(ctx, remainingParts);

    case "doc":
      remainingParts = parts.slice(1);
      return traversePath(ctx, ["documentMetadata", ...remainingParts]);

    case "segment":
      remainingParts = parts.slice(1);
      return traversePath(ctx, ["currentSegment", ...remainingParts]);

    default:
      // If no known namespace, treat the entire string as a ctx path
      return traversePath(ctx, parts);
  }
}

/**
 * Traverse an object by a sequence of property keys.
 * Returns null if any intermediate value is null or undefined.
 */
function traversePath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;

  for (const key of path) {
    if (current === null || current === undefined) {
      return null;
    }

    if (typeof current !== "object") {
      return null;
    }

    current = (current as Record<string, unknown>)[key];
  }

  if (current === undefined) {
    return null;
  }

  return current;
}

// ---------------------------------------------------------------------------
// Internal: Expression Evaluators
// ---------------------------------------------------------------------------

function evaluateComparison(
  expr: ComparisonExpression,
  ctx: Record<string, unknown>,
): boolean {
  const left = resolveValueRef(expr.left, ctx);
  const right = resolveValueRef(expr.right, ctx);

  switch (expr.operator) {
    case "equals":
      return left === right;

    case "not-equals":
      return left !== right;

    case "gt":
      if (typeof left !== "number" || typeof right !== "number") return false;
      return left > right;

    case "gte":
      if (typeof left !== "number" || typeof right !== "number") return false;
      return left >= right;

    case "lt":
      if (typeof left !== "number" || typeof right !== "number") return false;
      return left < right;

    case "lte":
      if (typeof left !== "number" || typeof right !== "number") return false;
      return left <= right;

    case "contains":
      if (typeof left !== "string" || typeof right !== "string") return false;
      return left.includes(right);

    default:
      return false;
  }
}

function evaluateLogical(
  expr: LogicalExpression,
  ctx: Record<string, unknown>,
): boolean {
  if (expr.operator === "and") {
    for (const operand of expr.operands) {
      if (!evaluateCondition(operand, ctx)) {
        return false;
      }
    }
    return true;
  }

  // "or"
  for (const operand of expr.operands) {
    if (evaluateCondition(operand, ctx)) {
      return true;
    }
  }
  return false;
}

function evaluateNot(
  expr: NotExpression,
  ctx: Record<string, unknown>,
): boolean {
  return !evaluateCondition(expr.operand, ctx);
}

function evaluateNullCheck(
  expr: NullCheckExpression,
  ctx: Record<string, unknown>,
): boolean {
  const value = resolveValueRef(expr.value, ctx);
  const isNull = value === null || value === undefined;

  return expr.operator === "is-null" ? isNull : !isNull;
}

function evaluateListMembership(
  expr: ListMembershipExpression,
  ctx: Record<string, unknown>,
): boolean {
  const value = resolveValueRef(expr.value, ctx);
  const list = resolveValueRef(expr.list, ctx);

  if (!Array.isArray(list)) {
    return false;
  }

  const found = list.includes(value);
  return expr.operator === "in" ? found : !found;
}
