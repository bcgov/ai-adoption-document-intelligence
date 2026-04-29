import { evaluateConditionWithBindings } from "./expression-evaluator";

describe("evaluateConditionWithBindings", () => {
  it("resolves param.X and row.X refs in lte comparison", () => {
    const expr = {
      operator: "lte",
      left: { ref: "param.submissionDate" },
      right: { ref: "row.cutoff" },
    } as never;
    const result = evaluateConditionWithBindings(expr, {
      ctx: {},
      param: { submissionDate: "2026-02-05" },
      row: { cutoff: "2026-02-12" },
    });
    expect(result).toBe(true);
  });

  it("resolves ctx.X with explicit prefix", () => {
    expect(
      evaluateConditionWithBindings(
        {
          operator: "equals",
          left: { ref: "ctx.foo" },
          right: { literal: "bar" },
        } as never,
        { ctx: { foo: "bar" }, param: {}, row: {} },
      ),
    ).toBe(true);
  });

  it("falls back to ctx for bare paths (legacy)", () => {
    expect(
      evaluateConditionWithBindings(
        {
          operator: "equals",
          left: { ref: "foo" },
          right: { literal: "bar" },
        } as never,
        { ctx: { foo: "bar" }, param: {}, row: {} },
      ),
    ).toBe(true);
  });

  it("supports nested paths in each namespace", () => {
    expect(
      evaluateConditionWithBindings(
        {
          operator: "equals",
          left: { ref: "row.nested.value" },
          right: { literal: 42 },
        } as never,
        { ctx: {}, param: {}, row: { nested: { value: 42 } } },
      ),
    ).toBe(true);
  });

  it("returns false when ref namespace key is missing", () => {
    expect(
      evaluateConditionWithBindings(
        {
          operator: "equals",
          left: { ref: "param.absent" },
          right: { literal: "x" },
        } as never,
        { ctx: {}, param: {}, row: {} },
      ),
    ).toBe(false);
  });

  it("supports literal-only comparison", () => {
    expect(
      evaluateConditionWithBindings(
        {
          operator: "equals",
          left: { literal: 5 },
          right: { literal: 5 },
        } as never,
        { ctx: {}, param: {}, row: {} },
      ),
    ).toBe(true);
  });

  it("supports logical 'and' with mixed namespace refs", () => {
    expect(
      evaluateConditionWithBindings(
        {
          operator: "and",
          operands: [
            {
              operator: "equals",
              left: { ref: "param.x" },
              right: { literal: 1 },
            },
            {
              operator: "equals",
              left: { ref: "row.y" },
              right: { literal: 2 },
            },
          ],
        } as never,
        { ctx: {}, param: { x: 1 }, row: { y: 2 } },
      ),
    ).toBe(true);
  });

  it("legacy evaluateCondition still works after refactor", async () => {
    const { evaluateCondition } = await import("./expression-evaluator");
    expect(
      evaluateCondition(
        {
          operator: "equals",
          left: { ref: "foo" },
          right: { literal: "bar" },
        } as never,
        { foo: "bar" },
      ),
    ).toBe(true);
  });
});
