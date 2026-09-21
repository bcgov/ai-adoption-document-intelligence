/**
 * Human labels for the condition operators (D23).
 *
 * The reviewer's complaint was that the Operator dropdown offered `gte` — a
 * developer shorthand for "greater than or equal to" that the rest of the app
 * never explains. The stored value is unchanged: these are presentation only,
 * and every `value` below is exactly the string that goes into the saved
 * `ConditionExpression`.
 *
 * Two vocabularies, deliberately:
 *
 *  - {@link OPERATOR_LABELS} — the long form for a `<Select>`, where there is
 *    room to say the words AND show the symbol. The wording is the one
 *    `docs-md/workflows/WORKFLOW_NODE_CATALOG.md` §"Branch by condition"
 *    already specified and the dropdown never implemented.
 *  - {@link COMPARISON_SYMBOLS} — the symbol alone, for compact read-only
 *    chips where a sentence would not fit.
 *
 * The symbols match what the canvas edge chips already draw
 * (`canvas/edge-labels.ts` renders `≥` / `≤`), so an author who picks
 * "is greater than or equal to (≥)" sees `≥` on the wire afterwards rather
 * than meeting a second vocabulary one screen later.
 */

import type {
  ComparisonExpression,
  ListMembershipExpression,
  NullCheckExpression,
} from "@ai-di/graph-workflow";

/**
 * Every operator a user can pick from a dropdown. The logical operators
 * (`and` / `or` / `not`) are not here: they are chosen through the
 * "Expression type" select, which was already worded in English.
 */
export type PickableOperator =
  | ComparisonExpression["operator"]
  | NullCheckExpression["operator"]
  | ListMembershipExpression["operator"];

/** Symbol-only rendering, for chips and other space-constrained surfaces. */
export const COMPARISON_SYMBOLS: Record<
  ComparisonExpression["operator"],
  string
> = {
  equals: "=",
  "not-equals": "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
};

/** Long-form labels for dropdowns. */
export const OPERATOR_LABELS: Record<PickableOperator, string> = {
  equals: "is equal to (=)",
  "not-equals": "is not equal to (≠)",
  gt: "is greater than (>)",
  gte: "is greater than or equal to (≥)",
  lt: "is less than (<)",
  lte: "is less than or equal to (≤)",
  contains: "contains",
  "is-null": "is empty",
  "is-not-null": "is not empty",
  in: "is in the list",
  "not-in": "is not in the list",
};

/**
 * Build the `data` array for a Mantine `<Select>` from a list of operators.
 * Keeping this in one place is what stops a fourth vocabulary appearing the
 * next time an operator dropdown is added.
 */
export function operatorSelectData<T extends PickableOperator>(
  operators: readonly T[],
): { value: T; label: string }[] {
  return operators.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }));
}
