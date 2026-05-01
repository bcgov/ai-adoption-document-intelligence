import { evaluateConditionWithBindings } from "../expression-evaluator";
import type { LookupDef } from "./types";

export class LookupError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "LookupError";
  }
}

export function executeLookup(
  lookup: LookupDef,
  params: Record<string, unknown>,
  rows: Array<Record<string, unknown>>,
): Record<string, unknown> | Array<Record<string, unknown>> | null {
  const matched = rows.filter((row) =>
    evaluateConditionWithBindings(lookup.filter, {
      ctx: {},
      param: params,
      row,
    }),
  );

  if (lookup.order && lookup.order.length > 0) {
    matched.sort((a, b) => {
      for (const o of lookup.order!) {
        const av = a[o.field];
        const bv = b[o.field];
        if (av === bv) continue;
        const cmp = (av as never) < (bv as never) ? -1 : 1;
        return o.direction === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }

  switch (lookup.pick) {
    case "all":
      return matched;
    case "first":
      return matched[0] ?? null;
    case "last":
      return matched[matched.length - 1] ?? null;
    case "one":
      if (matched.length === 0) {
        throw new LookupError(
          "TABLES_NO_MATCH",
          `no rows matched lookup ${lookup.name}`,
        );
      }
      if (matched.length > 1) {
        throw new LookupError(
          "TABLES_AMBIGUOUS_MATCH",
          `${matched.length} rows matched lookup ${lookup.name} (expected exactly 1)`,
        );
      }
      return matched[0];
    default: {
      const _exhaustive: never = lookup.pick;
      throw new Error(`unhandled pick strategy: ${String(_exhaustive)}`);
    }
  }
}
