import {
  type ConcurrentOutcome,
  executeWithConcurrencyLimit,
  fulfilledValues,
  parseDurationToMs,
  rejectedOutcomes,
} from "./runner-utils";

/** The fulfilled values, in original index order. */
function values(outcomes: ConcurrentOutcome[]): unknown[] {
  return fulfilledValues(outcomes);
}

describe("executeWithConcurrencyLimit", () => {
  it("should execute all items", async () => {
    const items = [1, 2, 3, 4, 5];
    const outcomes = await executeWithConcurrencyLimit(
      items,
      2,
      async (item) => item * 2,
    );

    expect(values(outcomes)).toEqual([2, 4, 6, 8, 10]);
  });

  it("should preserve order of results", async () => {
    const items = [1, 2, 3, 4, 5];
    const delays = [50, 10, 30, 5, 20];

    const outcomes = await executeWithConcurrencyLimit(
      items,
      3,
      async (item, index) => {
        await new Promise((resolve) => setTimeout(resolve, delays[index]));
        return item * 2;
      },
    );

    expect(values(outcomes)).toEqual([2, 4, 6, 8, 10]);
  });

  it("should limit concurrency", async () => {
    const items = [1, 2, 3, 4, 5];
    let currentConcurrency = 0;
    let maxObservedConcurrency = 0;

    await executeWithConcurrencyLimit(items, 2, async () => {
      currentConcurrency++;
      maxObservedConcurrency = Math.max(
        maxObservedConcurrency,
        currentConcurrency,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrency--;
    });

    expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
  });

  it("should handle empty array", async () => {
    const outcomes = await executeWithConcurrencyLimit(
      [],
      2,
      async (item) => item,
    );
    expect(outcomes).toEqual([]);
  });

  it("should handle single item", async () => {
    const outcomes = await executeWithConcurrencyLimit(
      [42],
      2,
      async (item) => item * 2,
    );
    expect(values(outcomes)).toEqual([84]);
  });

  it("should handle concurrency limit greater than items", async () => {
    const items = [1, 2, 3];
    const outcomes = await executeWithConcurrencyLimit(
      items,
      10,
      async (item) => item * 2,
    );

    expect(values(outcomes)).toEqual([2, 4, 6]);
  });
});

// ---------------------------------------------------------------------------
// G-026 — one failed item must not destroy the rest
// ---------------------------------------------------------------------------

describe("executeWithConcurrencyLimit — partial failure (G-026)", () => {
  it("returns every successful result when one item fails", async () => {
    const outcomes = await executeWithConcurrencyLimit(
      [1, 2, 3, 4, 5],
      2,
      async (item: number) => {
        if (item === 3) throw new Error("branch 3 exploded");
        return item * 2;
      },
    );

    // The four siblings survive, in original index order.
    expect(values(outcomes)).toEqual([2, 4, 8, 10]);
  });

  it("reports which indices failed, with their errors", async () => {
    const outcomes = await executeWithConcurrencyLimit(
      [1, 2, 3, 4],
      2,
      async (item: number) => {
        if (item % 2 === 1) throw new Error(`odd ${item}`);
        return item;
      },
    );

    const failures = rejectedOutcomes(outcomes);
    expect(failures.map((f) => f.index)).toEqual([0, 2]);
    expect((failures[0].reason as Error).message).toBe("odd 1");
    expect((failures[1].reason as Error).message).toBe("odd 3");
  });

  it("still respects the concurrency limit when failures occur", async () => {
    let current = 0;
    let maxObserved = 0;

    await executeWithConcurrencyLimit(
      [1, 2, 3, 4, 5, 6],
      2,
      async (item: number) => {
        current++;
        maxObserved = Math.max(maxObserved, current);
        await new Promise((resolve) => setTimeout(resolve, 10));
        current--;
        if (item % 2 === 0) throw new Error(`even ${item}`);
        return item;
      },
    );

    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it("surfaces the failure to the caller rather than swallowing it", async () => {
    // The helper never rejects — it settles. The failure is not lost: it is
    // reported as an outcome so the CALLER (the map executor) can apply the
    // node's error policy. The helper itself decides no policy.
    const outcomes = await executeWithConcurrencyLimit(
      [1, 2],
      2,
      async (item: number) => {
        if (item === 2) throw new Error("boom");
        return item;
      },
    );

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]).toEqual({ status: "fulfilled", index: 0, value: 1 });
    expect(outcomes[1].status).toBe("rejected");
    expect(rejectedOutcomes(outcomes)).toHaveLength(1);
  });

  it("returns nothing fulfilled when every item fails", async () => {
    const outcomes = await executeWithConcurrencyLimit(
      [1, 2, 3],
      2,
      async () => {
        throw new Error("all bad");
      },
    );
    expect(values(outcomes)).toEqual([]);
    expect(rejectedOutcomes(outcomes)).toHaveLength(3);
  });
});

describe("parseDurationToMs", () => {
  it("should parse milliseconds", () => {
    expect(parseDurationToMs("100ms")).toBe(100);
    expect(parseDurationToMs("500ms")).toBe(500);
  });

  it("should parse seconds", () => {
    expect(parseDurationToMs("1s")).toBe(1000);
    expect(parseDurationToMs("5s")).toBe(5000);
    expect(parseDurationToMs("30s")).toBe(30000);
  });

  it("should parse minutes", () => {
    expect(parseDurationToMs("1m")).toBe(60000);
    expect(parseDurationToMs("5m")).toBe(300000);
  });

  it("should parse hours", () => {
    expect(parseDurationToMs("1h")).toBe(3600000);
    expect(parseDurationToMs("2h")).toBe(7200000);
  });

  it("should parse days", () => {
    expect(parseDurationToMs("1d")).toBe(86400000);
    expect(parseDurationToMs("2d")).toBe(172800000);
  });

  it("should handle decimal values", () => {
    expect(parseDurationToMs("1.5s")).toBe(1500);
    expect(parseDurationToMs("0.5m")).toBe(30000);
  });

  it("should handle whitespace", () => {
    expect(parseDurationToMs("  1s  ")).toBe(1000);
    expect(parseDurationToMs("5m ")).toBe(300000);
  });

  it("should be case insensitive", () => {
    expect(parseDurationToMs("1S")).toBe(1000);
    expect(parseDurationToMs("5M")).toBe(300000);
  });

  it("should throw on invalid format", () => {
    expect(() => parseDurationToMs("invalid")).toThrow(
      "Invalid duration string",
    );
    expect(() => parseDurationToMs("100")).toThrow("Invalid duration string");
    expect(() => parseDurationToMs("s100")).toThrow("Invalid duration string");
  });

  it("should throw on invalid unit", () => {
    expect(() => parseDurationToMs("100x")).toThrow("Invalid duration string");
  });
});
