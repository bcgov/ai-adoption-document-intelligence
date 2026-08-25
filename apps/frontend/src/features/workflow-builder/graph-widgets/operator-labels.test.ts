/**
 * D23 — the operator dropdown said `gte`.
 *
 * The load-bearing property is not that the labels read nicely; it is that
 * NOTHING about the stored value changed. So the tests assert the mapping is
 * total over the type union (a new operator cannot be added without a label)
 * and that every `value` emitted for a `<Select>` is byte-identical to the
 * operator it came from.
 */

import { describe, expect, it } from "vitest";
import {
  COMPARISON_SYMBOLS,
  OPERATOR_LABELS,
  operatorSelectData,
  type PickableOperator,
} from "./operator-labels";

const ALL_PICKABLE: PickableOperator[] = [
  "equals",
  "not-equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "is-null",
  "is-not-null",
  "in",
  "not-in",
];

describe("operator labels", () => {
  it("labels every pickable operator", () => {
    for (const op of ALL_PICKABLE) {
      expect(OPERATOR_LABELS[op]).toBeTruthy();
    }
    expect(Object.keys(OPERATOR_LABELS).sort()).toEqual(
      [...ALL_PICKABLE].sort(),
    );
  });

  it("never renders the raw shorthand as a label", () => {
    // The exact complaint: `gte` on screen. `contains` is the one operator
    // whose shorthand IS a word, so it is allowed to be its own label.
    for (const op of ALL_PICKABLE) {
      if (op === "contains") continue;
      expect(OPERATOR_LABELS[op]).not.toBe(op);
    }
    expect(OPERATOR_LABELS.gte).toBe("is greater than or equal to (≥)");
  });

  it("leaves the stored value untouched in select data", () => {
    const data = operatorSelectData(ALL_PICKABLE);
    expect(data.map((d) => d.value)).toEqual(ALL_PICKABLE);
  });

  it("gives every comparison operator a symbol for compact surfaces", () => {
    expect(COMPARISON_SYMBOLS.gte).toBe("≥");
    expect(COMPARISON_SYMBOLS.lte).toBe("≤");
    expect(COMPARISON_SYMBOLS["not-equals"]).toBe("≠");
    for (const op of ALL_PICKABLE) {
      if (op in COMPARISON_SYMBOLS) {
        expect(
          COMPARISON_SYMBOLS[op as keyof typeof COMPARISON_SYMBOLS],
        ).toBeTruthy();
      }
    }
  });
});
