import type {
  ConditionExpression,
  ValueRef,
} from "../workflow/graph-workflow-types";
import type { LookupDef } from "./types";

export function findLookupsReferencingColumn(
  lookups: LookupDef[],
  columnKey: string,
): string[] {
  const result: string[] = [];
  for (const lookup of lookups) {
    if (lookupReferencesColumn(lookup, columnKey)) {
      result.push(lookup.name);
    }
  }
  return result;
}

function lookupReferencesColumn(lookup: LookupDef, key: string): boolean {
  if (lookup.order?.some((o) => o.field === key)) return true;
  return expressionReferencesColumn(lookup.filter, key);
}

function expressionReferencesColumn(
  expr: ConditionExpression,
  key: string,
): boolean {
  switch (expr.operator) {
    case "and":
    case "or":
      // LogicalExpression uses `operands` (not `expressions`)
      return expr.operands.some((s) => expressionReferencesColumn(s, key));
    case "not":
      // NotExpression uses `operand` (not `expression`)
      return expressionReferencesColumn(expr.operand, key);
    case "is-null":
    case "is-not-null":
      return refReferencesColumn(expr.value, key);
    case "in":
    case "not-in":
      // ListMembershipExpression.list is a single ValueRef (not an array)
      return (
        refReferencesColumn(expr.value, key) ||
        refReferencesColumn(expr.list, key)
      );
    case "equals":
    case "not-equals":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "contains":
      return (
        refReferencesColumn(expr.left, key) ||
        refReferencesColumn(expr.right, key)
      );
    default: {
      const _exhaustive: never = expr;
      throw new Error(
        `unhandled expression operator: ${(_exhaustive as ConditionExpression).operator}`,
      );
    }
  }
}

function refReferencesColumn(ref: ValueRef, key: string): boolean {
  if ("literal" in ref) return false;
  return ref.ref === `row.${key}` || ref.ref.startsWith(`row.${key}.`);
}
