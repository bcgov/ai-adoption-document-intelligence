import type {
  ConditionExpression,
  ValueRef,
} from "../workflow/graph-workflow-types";
import type { ColumnDef, LookupDef } from "./types";

export function validateLookupDefs(
  lookups: LookupDef[],
  cols: ColumnDef[],
): void {
  const colKeys = new Set(cols.map((c) => c.key));
  const seenNames = new Set<string>();
  for (const lookup of lookups) {
    if (seenNames.has(lookup.name)) {
      throw new Error(`duplicate lookup name "${lookup.name}"`);
    }
    seenNames.add(lookup.name);
    const paramNames = new Set(lookup.params.map((p) => p.name));
    validateExpression(lookup.filter, colKeys, paramNames, lookup.name);
    if (lookup.order) {
      for (const o of lookup.order) {
        if (!colKeys.has(o.field)) {
          throw new Error(
            `lookup "${lookup.name}": unknown column "${o.field}" in order clause`,
          );
        }
      }
    }
  }
}

function validateExpression(
  expr: ConditionExpression,
  colKeys: Set<string>,
  paramNames: Set<string>,
  lookupName: string,
): void {
  switch (expr.operator) {
    case "and":
    case "or":
      // LogicalExpression uses `operands` (not `expressions`)
      for (const sub of expr.operands) {
        validateExpression(sub, colKeys, paramNames, lookupName);
      }
      return;
    case "not":
      // NotExpression uses `operand` (not `expression`)
      validateExpression(expr.operand, colKeys, paramNames, lookupName);
      return;
    case "is-null":
    case "is-not-null":
      validateRef(expr.value, colKeys, paramNames, lookupName);
      return;
    case "in":
    case "not-in":
      // ListMembershipExpression.list is a single ValueRef (not an array)
      validateRef(expr.value, colKeys, paramNames, lookupName);
      validateRef(expr.list, colKeys, paramNames, lookupName);
      return;
    default:
      // ComparisonExpression: equals, not-equals, gt, gte, lt, lte, contains
      validateRef(expr.left, colKeys, paramNames, lookupName);
      validateRef(expr.right, colKeys, paramNames, lookupName);
      return;
  }
}

function validateRef(
  ref: ValueRef,
  colKeys: Set<string>,
  paramNames: Set<string>,
  lookupName: string,
): void {
  // ValueRef is { ref: string; literal?: never } | { literal: unknown; ref?: never }
  // A literal ref has no `ref` string (it's undefined/never)
  if (ref.ref === undefined) return;
  const path = ref.ref;
  if (path.startsWith("row.")) {
    const key = path.slice("row.".length).split(".")[0];
    if (!colKeys.has(key)) {
      throw new Error(
        `lookup "${lookupName}": unknown column "${key}" in row.X reference`,
      );
    }
  } else if (path.startsWith("param.")) {
    const key = path.slice("param.".length).split(".")[0];
    if (!paramNames.has(key)) {
      throw new Error(`lookup "${lookupName}": undeclared param "${key}"`);
    }
  }
  // ctx.X and other references are unrestricted (admin's responsibility)
}
