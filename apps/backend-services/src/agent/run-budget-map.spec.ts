import { RunBudgetMap } from "./run-budget-map";

describe("RunBudgetMap", () => {
  it("allows up to `max` consumes per conversation, then refuses", () => {
    const budget = new RunBudgetMap();
    const max = 3;
    expect(budget.tryConsume("c1", max)).toBe(true); // 1
    expect(budget.tryConsume("c1", max)).toBe(true); // 2
    expect(budget.tryConsume("c1", max)).toBe(true); // 3
    expect(budget.tryConsume("c1", max)).toBe(false); // over
  });

  it("tracks conversations independently", () => {
    const budget = new RunBudgetMap();
    expect(budget.tryConsume("a", 1)).toBe(true);
    expect(budget.tryConsume("a", 1)).toBe(false);
    expect(budget.tryConsume("b", 1)).toBe(true);
  });

  it("reports remaining budget without consuming", () => {
    const budget = new RunBudgetMap();
    budget.tryConsume("c", 5);
    expect(budget.remaining("c", 5)).toBe(4);
    expect(budget.remaining("unseen", 5)).toBe(5);
  });
});
