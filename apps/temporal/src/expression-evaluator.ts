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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Named binding namespaces for evaluating expressions in a table lookup context.
 *
 * - `ctx`: workflow context variables (legacy bare-path refs also resolve here)
 * - `param`: lookup invocation parameters (`param.X` refs)
 * - `row`: current table row being evaluated (`row.X` refs)
 */
export interface EvalBindings {
  ctx: Record<string, unknown>;
  param: Record<string, unknown>;
  row: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a condition expression against a workflow context.
 * Legacy wrapper — delegates to evaluateConditionWithBindings.
 */
export function evaluateCondition(
  expression: ConditionExpression,
  ctx: Record<string, unknown>,
): boolean {
  return evaluateConditionWithBindings(expression, { ctx, param: {}, row: {} });
}

/**
 * Evaluate a condition expression with namespaced bindings.
 *
 * Ref routing rules:
 * - `param.X`  → resolved against bindings.param
 * - `row.X`    → resolved against bindings.row
 * - `ctx.X`    → resolved against bindings.ctx
 * - bare `X`   → resolved against bindings.ctx (legacy back-compat)
 * - `literal`  → returned as-is
 */
export function evaluateConditionWithBindings(
  expression: ConditionExpression,
  bindings: EvalBindings,
): boolean {
  const resolve = (ref: ValueRef): unknown =>
    resolveRefWithBindings(ref, bindings);
  return walkExpr(expression, resolve);
}

/**
 * Resolve a ValueRef to its actual value from context or as a literal.
 */
export function resolveValueRef(
  ref: ValueRef,
  ctx: Record<string, unknown>,
): unknown {
  return resolveRefWithBindings(ref, { ctx, param: {}, row: {} });
}

// ---------------------------------------------------------------------------
// Internal: Reference Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a ValueRef using namespaced bindings.
 */
function resolveRefWithBindings(
  ref: ValueRef,
  bindings: EvalBindings,
): unknown {
  if ("literal" in ref && ref.literal !== undefined) {
    return ref.literal;
  }

  if ("ref" in ref && ref.ref !== undefined) {
    return resolveReferenceWithBindings(ref.ref, bindings);
  }

  return null;
}

/**
 * Resolve a dotted reference string against the appropriate namespace binding.
 *
 * Supported namespaces:
 * - param.<key>            -> bindings.param[key]
 * - row.<key>              -> bindings.row[key]
 * - ctx.<key>              -> bindings.ctx[key]
 * - ctx.<key>.<nested>     -> bindings.ctx[key][nested]
 * - doc.<field>            -> bindings.ctx.documentMetadata[field]
 * - segment.<field>        -> bindings.ctx.currentSegment[field]
 * - bare <key>             -> bindings.ctx[key] (legacy back-compat)
 */
function resolveReferenceWithBindings(
  refString: string,
  bindings: EvalBindings,
): unknown {
  const parts = refString.split(".");

  if (parts.length === 0) {
    return null;
  }

  const namespace = parts[0];
  const remainingParts = parts.slice(1);

  switch (namespace) {
    case "param":
      return traversePath(bindings.param, remainingParts);

    case "row":
      return traversePath(bindings.row, remainingParts);

    case "ctx":
      return traversePath(bindings.ctx, remainingParts);

    case "doc":
      return traversePath(bindings.ctx, [
        "documentMetadata",
        ...remainingParts,
      ]);

    case "segment":
      return traversePath(bindings.ctx, ["currentSegment", ...remainingParts]);

    default:
      // Bare path — legacy callers that don't use a namespace prefix
      return traversePath(bindings.ctx, parts);
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
// Internal: Expression Tree Walker
// ---------------------------------------------------------------------------

/**
 * Walk a ConditionExpression tree, resolving values via the provided resolver.
 */
function walkExpr(
  expression: ConditionExpression,
  resolve: (ref: ValueRef) => unknown,
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
      return walkComparison(expression as ComparisonExpression, resolve);

    // Logical operators
    case "and":
    case "or":
      return walkLogical(expression as LogicalExpression, resolve);

    // Not operator
    case "not":
      return walkNot(expression as NotExpression, resolve);

    // Null check operators
    case "is-null":
    case "is-not-null":
      return walkNullCheck(expression as NullCheckExpression, resolve);

    // List membership operators
    case "in":
    case "not-in":
      return walkListMembership(
        expression as ListMembershipExpression,
        resolve,
      );

    default: {
      const exhaustiveCheck: never = expression;
      throw new Error(
        `Unknown expression operator: ${(exhaustiveCheck as ConditionExpression).operator}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: Expression Evaluators
// ---------------------------------------------------------------------------

function walkComparison(
  expr: ComparisonExpression,
  resolve: (ref: ValueRef) => unknown,
): boolean {
  const left = resolve(expr.left);
  const right = resolve(expr.right);

  switch (expr.operator) {
    case "equals":
      return left === right;

    case "not-equals":
      return left !== right;

    case "gt":
      if (typeof left === "number" && typeof right === "number")
        return left > right;
      if (typeof left === "string" && typeof right === "string")
        return left > right;
      return false;

    case "gte":
      if (typeof left === "number" && typeof right === "number")
        return left >= right;
      if (typeof left === "string" && typeof right === "string")
        return left >= right;
      return false;

    case "lt":
      if (typeof left === "number" && typeof right === "number")
        return left < right;
      if (typeof left === "string" && typeof right === "string")
        return left < right;
      return false;

    case "lte":
      if (typeof left === "number" && typeof right === "number")
        return left <= right;
      if (typeof left === "string" && typeof right === "string")
        return left <= right;
      return false;

    case "contains":
      if (typeof left !== "string" || typeof right !== "string") return false;
      return left.includes(right);

    default:
      return false;
  }
}

function walkLogical(
  expr: LogicalExpression,
  resolve: (ref: ValueRef) => unknown,
): boolean {
  if (expr.operator === "and") {
    for (const operand of expr.operands) {
      if (!walkExpr(operand, resolve)) {
        return false;
      }
    }
    return true;
  }

  // "or"
  for (const operand of expr.operands) {
    if (walkExpr(operand, resolve)) {
      return true;
    }
  }
  return false;
}

function walkNot(
  expr: NotExpression,
  resolve: (ref: ValueRef) => unknown,
): boolean {
  return !walkExpr(expr.operand, resolve);
}

function walkNullCheck(
  expr: NullCheckExpression,
  resolve: (ref: ValueRef) => unknown,
): boolean {
  const value = resolve(expr.value);
  const isNull = value === null || value === undefined;

  return expr.operator === "is-null" ? isNull : !isNull;
}

function walkListMembership(
  expr: ListMembershipExpression,
  resolve: (ref: ValueRef) => unknown,
): boolean {
  const value = resolve(expr.value);
  const list = resolve(expr.list);

  if (!Array.isArray(list)) {
    return false;
  }

  const found = list.includes(value);
  return expr.operator === "in" ? found : !found;
}
